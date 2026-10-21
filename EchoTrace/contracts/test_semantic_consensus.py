"""
Offline unit & regression tests for EchoTrace semantic consensus and provenance contract.
[MOCKED TESTS]: These tests validate local contract semantics, anti-hallucination guards,
and evidence validation using local stubs. They do NOT prove live network consensus behavior.

Tests:
1. Different evidence produces different valid semantic outcomes (primary_reporting vs attributed_source vs mentions_only vs unrelated).
2. Rejection of schema-valid, exactly anchored quote paired with an unsupported provenance stance.
3. Rejection of unanchored / hallucinated quotes without silent heuristic substitution.
4. Self-referential / internal URLs preserve primary_reporting without false external attribution.
5. Unrelated content marked unrelated with zero contributions.
6. Model execution failure returns status 'failed' and stance 'unclear' (never swallowed).
7. Render failure returns status 'unavailable'.
8. Full lifecycle create_case -> review -> seal -> review_rel -> finalize_case verifying report metrics and completeness.
"""

import functools
import hashlib
import json
import os
import sys
import types
import unittest

# --- Minimal offline GenLayer stub ---
class MockGL:
    class vm:
        class UserError(Exception):
            pass

    class nondet:
        class web:
            @staticmethod
            def render(url, mode="text"):
                return MockGL._render_mock(url, mode)

        @staticmethod
        def exec_prompt(prompt, response_format="json"):
            return MockGL._llm_mock(prompt, response_format)

    class eq_principle:
        @staticmethod
        def prompt_comparative(fn, criteria):
            res = fn()
            return res

    class message:
        sender_address = "0x1111111111111111111111111111111111111111"

    class public:
        @staticmethod
        def view(fn):
            return fn

        class write:
            def __init__(self, fn):
                self.fn = fn
            def __get__(self, instance, owner):
                if instance is None:
                    return self
                return functools.partial(self.fn, instance)
            def __call__(self, *args, **kwargs):
                return self.fn(*args, **kwargs)

    class Contract:
        pass

    _render_mock = None
    _llm_mock = None

# Inject stub into sys.modules
genlayer_mod = types.ModuleType("genlayer")
genlayer_mod.gl = MockGL
genlayer_mod.TreeMap = dict
genlayer_mod.u32 = int
genlayer_mod.u256 = int
for attr in dir(MockGL):
    if not attr.startswith("__"):
        setattr(genlayer_mod, attr, getattr(MockGL, attr))

sys.modules["genlayer"] = genlayer_mod
sys.modules["py-genlayer"] = genlayer_mod

# Add contracts dir to path
contracts_dir = os.path.join(os.path.dirname(__file__))
sys.path.insert(0, contracts_dir)

import echotrace
from echotrace import EchoTrace

class TestEchoTraceSemanticConsensus(unittest.TestCase):
    def setUp(self):
        self.contract = EchoTrace()
        self.contract.requests = {}
        self.contract.cases = {}
        self.contract.case_count = 0
        MockGL.message.sender_address = "0x1111111111111111111111111111111111111111"

    def test_semantic_differentiation_primary_vs_attributed_vs_mentions(self):
        """[MOCKED TEST]: Verifies different observed evidence yields different justified consensus classifications."""
        claim = "Acme Corp launched Project Echo on October 18."

        # Source A: Primary announcement without external attribution
        text_primary = "Acme Corp launched Project Echo on October 18 as our primary initiative."
        MockGL._render_mock = lambda url, mode: text_primary
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "primary_reporting",
            "exact_quote": text_primary,
            "substantive": True,
            "explanation": "Direct company statement."
        })
        res_primary = json.loads(self.contract._analyze("https://acme.org/news", claim))
        self.assertEqual(res_primary["status"], "reviewed")
        self.assertEqual(res_primary["stance"], "primary_reporting")
        self.assertEqual(len(res_primary["contributions"]), 1)
        self.assertEqual(res_primary["contributions"][0]["relation"], "primary_reporting")
        self.assertEqual(res_primary["contributions"][0]["quoteOffset"], 0)

        # Source B: Attributed source citing external wire
        text_attributed = "According to https://wire.example/item Acme Corp launched Project Echo on October 18."
        MockGL._render_mock = lambda url, mode: text_attributed
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "attributed_source",
            "exact_quote": text_attributed,
            "substantive": True,
            "explanation": "Cites wire.example."
        })
        res_attributed = json.loads(self.contract._analyze("https://techblog.com/post", claim))
        self.assertEqual(res_attributed["status"], "reviewed")
        self.assertEqual(res_attributed["stance"], "attributed_source")
        self.assertEqual(res_attributed["contributions"][0]["relation"], "attributed_source")
        self.assertEqual(res_attributed["contributions"][0]["originUrl"], "https://wire.example/item")

        # Source C: Mentions in passing
        text_mention = "The industry discussed how Acme Corp launched Project Echo on October 18 amid broader trends."
        MockGL._render_mock = lambda url, mode: text_mention
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "mentions_only",
            "exact_quote": text_mention,
            "substantive": True,
            "explanation": "Mentioned in passing."
        })
        res_mention = json.loads(self.contract._analyze("https://analyst.com/trends", claim))
        self.assertEqual(res_mention["status"], "reviewed")
        self.assertEqual(res_mention["stance"], "mentions_only")
        self.assertEqual(res_mention["contributions"][0]["relation"], "mentions_only")

    def test_rejection_of_schema_valid_quote_with_unsupported_stance(self):
        """[MOCKED TEST]: A schema-valid, exactly anchored quote paired with an unsupported stance must be rejected by validation logic."""
        claim = "Acme Corp launched Project Echo on October 18."
        # Quote is verbatim in text and schema-valid, BUT explicitly attributes to Reuters wire
        text = "According to Reuters and https://reuters.com, Acme Corp launched Project Echo on October 18."
        MockGL._render_mock = lambda url, mode: text
        # Model falsely claims primary_reporting despite explicit third-party attribution
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "primary_reporting",
            "exact_quote": text,
            "substantive": True,
            "explanation": "Falsely proposing primary_reporting on an external wire citation."
        })
        res = json.loads(self.contract._analyze("https://secondary-blog.com/post", claim))
        # Validation logic must catch this contradiction and REJECT the assessment
        self.assertEqual(res["status"], "failed")
        self.assertEqual(res["stance"], "unclear")
        self.assertEqual(len(res["contributions"]), 0)
        self.assertTrue("cites an external URL" in res["limitations"] or "third-party attribution" in res["limitations"])

    def test_rejection_of_unanchored_quote_without_silent_substitution(self):
        """[MOCKED TEST]: An unanchored quote is rejected as failed; must NOT be silently replaced with heuristic text."""
        claim = "Acme Corp launched Project Echo on October 18."
        text = "Acme Corp launched Project Echo on October 18 without hesitation."
        MockGL._render_mock = lambda url, mode: text
        # Model returns a quote that is NOT in the text
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "primary_reporting",
            "exact_quote": "This sentence does not exist anywhere in the page text.",
            "substantive": True,
            "explanation": "Hallucinated quote."
        })
        res = json.loads(self.contract._analyze("https://acme.org/news", claim))
        # No silent heuristic replacement: marked failed, stance unclear
        self.assertEqual(res["status"], "failed")
        self.assertEqual(res["stance"], "unclear")
        self.assertEqual(len(res["contributions"]), 0)
        self.assertTrue("not an exact verbatim substring" in res["limitations"])

    def test_self_referential_url_preserves_primary_reporting(self):
        """[MOCKED TEST]: Quote citing an internal URL on the same host remains primary_reporting, not falsely downgraded."""
        claim = "Acme Corp launched Project Echo on October 18."
        # The quote contains a URL on the SAME domain (acme.org)
        text = "Acme Corp launched Project Echo on October 18 as detailed in our bulletin at https://acme.org/bulletin."
        MockGL._render_mock = lambda url, mode: text
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "primary_reporting",
            "exact_quote": text,
            "substantive": True,
            "explanation": "Primary company post with self-referential link."
        })
        res = json.loads(self.contract._analyze("https://acme.org/news", claim))
        self.assertEqual(res["status"], "reviewed")
        self.assertEqual(res["stance"], "primary_reporting")
        self.assertEqual(len(res["contributions"]), 1)
        self.assertEqual(res["contributions"][0]["relation"], "primary_reporting")
        # Internal URL is NOT an external origin dependency
        self.assertIsNone(res["contributions"][0]["originUrl"])

    def test_unrelated_with_non_empty_quote_rejected(self):
        """[MOCKED TEST]: Stance 'unrelated' paired with a non-empty quote must be rejected."""
        claim = "Acme Corp launched Project Echo on October 18."
        text = "Recipes for sourdough bread require flour water and yeast fermented over twenty four hours."
        MockGL._render_mock = lambda url, mode: text
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "unrelated",
            "exact_quote": "Recipes for sourdough bread require flour water and yeast.",
            "substantive": False,
            "explanation": "Contradictory quote supplied for unrelated classification."
        })
        res = json.loads(self.contract._analyze("https://baking.com/bread", claim))
        self.assertEqual(res["status"], "failed")
        self.assertEqual(res["stance"], "unclear")
        self.assertEqual(len(res["contributions"]), 0)
        self.assertTrue("exact_quote must be empty when stance is unrelated" in res["limitations"])

    def test_invalid_field_types_rejected(self):
        """[MOCKED TEST]: Invalid field types (non-boolean substantive, non-string quote, non-dict response) must be rejected without coercion."""
        claim = "Acme Corp launched Project Echo on October 18."
        text = "Acme Corp launched Project Echo on October 18."
        MockGL._render_mock = lambda url, mode: text

        # 1. substantive is a string instead of boolean
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "primary_reporting",
            "exact_quote": text,
            "substantive": "true",  # String, not boolean
            "explanation": "Invalid type."
        })
        res1 = json.loads(self.contract._analyze("https://acme.org/news", claim))
        self.assertEqual(res1["status"], "failed")
        self.assertTrue("substantive' must be a boolean" in res1["limitations"])

        # 2. exact_quote is a number
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "primary_reporting",
            "exact_quote": 12345,  # Number, not string
            "substantive": True,
            "explanation": "Invalid type."
        })
        res2 = json.loads(self.contract._analyze("https://acme.org/news", claim))
        self.assertEqual(res2["status"], "failed")
        self.assertTrue("exact_quote' must be a string" in res2["limitations"])

        # 3. stance is an integer
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": 42,
            "exact_quote": text,
            "substantive": True,
            "explanation": "Invalid type."
        })
        res3 = json.loads(self.contract._analyze("https://acme.org/news", claim))
        self.assertEqual(res3["status"], "failed")
        self.assertTrue("stance' must be a string" in res3["limitations"])

    def test_inconsistent_substantive_stance_combinations_rejected(self):
        """[MOCKED TEST]: Inconsistent combinations between substantive and stance must be rejected."""
        claim = "Acme Corp launched Project Echo on October 18."
        text = "Acme Corp launched Project Echo on October 18."
        MockGL._render_mock = lambda url, mode: text

        # Case 1: stance == 'unrelated' but substantive == True
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "unrelated",
            "exact_quote": "",
            "substantive": True,  # Inconsistent with unrelated
            "explanation": "Inconsistent flags."
        })
        res1 = json.loads(self.contract._analyze("https://acme.org/news", claim))
        self.assertEqual(res1["status"], "failed")
        self.assertTrue("substantive must be false when stance is unrelated" in res1["limitations"])

        # Case 2: stance == 'primary_reporting' but substantive == False
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "primary_reporting",
            "exact_quote": text,
            "substantive": False,  # Inconsistent with primary_reporting
            "explanation": "Inconsistent flags."
        })
        res2 = json.loads(self.contract._analyze("https://acme.org/news", claim))
        self.assertEqual(res2["status"], "failed")
        self.assertTrue("substantive must be true for relevant stance" in res2["limitations"])

    def test_unrelated_content_not_forced_to_success(self):
        """[MOCKED TEST]: Page that discusses unrelated topic must be marked unrelated, with no contributions."""
        claim = "Acme Corp launched Project Echo on October 18."
        text = "Recipes for sourdough bread require flour water and yeast fermented over twenty four hours."
        MockGL._render_mock = lambda url, mode: text
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "unrelated",
            "exact_quote": "",
            "substantive": False,
            "explanation": "Bread recipe has nothing to do with Acme Corp."
        })
        res = json.loads(self.contract._analyze("https://baking.com/bread", claim))
        self.assertEqual(res["status"], "reviewed")
        self.assertEqual(res["stance"], "unrelated")
        self.assertEqual(len(res["contributions"]), 0)

    def test_model_failure_marks_review_failed_not_success(self):
        """[MOCKED TEST]: Model exception or malformed JSON must mark status 'failed' and stance 'unclear'."""
        claim = "Acme Corp launched Project Echo on October 18."
        text = "Acme Corp launched Project Echo on October 18."
        MockGL._render_mock = lambda url, mode: text
        MockGL._llm_mock = lambda prompt, rf: "INTERNAL_MODEL_ERROR: Service unavailable"
        res = json.loads(self.contract._analyze("https://acme.org/news", claim))
        self.assertEqual(res["status"], "failed")
        self.assertEqual(res["stance"], "unclear")
        self.assertEqual(len(res["contributions"]), 0)

    def test_render_failure_marks_review_unavailable(self):
        """[MOCKED TEST]: Network / render failure must mark status 'unavailable'."""
        claim = "Acme Corp launched Project Echo on October 18."
        def fail_render(url, mode):
            raise Exception("Connection timed out")
        MockGL._render_mock = fail_render
        res = json.loads(self.contract._analyze("https://offline.example.com", claim))
        self.assertEqual(res["status"], "unavailable")
        self.assertIsNone(res["stance"])

    def test_full_lifecycle_and_report_aggregation(self):
        """[MOCKED TEST]: Tests create_case -> review -> seal -> review_rel -> finalize_case verifying report metrics."""
        manifest = {
            "claim": "Example domains are documentation fixtures.",
            "sources": [
                {"id": "src-1", "url": "https://example.com", "role": "submitted", "parentSourceId": None},
                {"id": "src-2", "url": "https://example.org", "role": "submitted", "parentSourceId": None},
                {"id": "src-3", "url": "https://example.net", "role": "submitted", "parentSourceId": None},
            ],
            "clientRequestId": "req-targeted-test-001",
            "parentCaseId": None,
        }
        case_id = self.contract.create_case(json.dumps(manifest))
        self.assertTrue(case_id.startswith("et-"))
        self.assertEqual(len(case_id), 15)

        text1 = "Example domains are documentation fixtures established under IETF RFC guidance."
        text2 = "According to https://example.com, example domains are documentation fixtures."
        text3 = "Example domains are documentation fixtures mentioned in modern technical manuals."

        texts = {
            "https://example.com": (text1, "primary_reporting"),
            "https://example.org": (text2, "attributed_source"),
            "https://example.net": (text3, "mentions_only"),
        }

        MockGL._render_mock = lambda url, mode: texts[url][0]
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "primary_reporting" if "IETF RFC" in prompt else ("attributed_source" if "https://example.com" in prompt else "mentions_only"),
            "exact_quote": text1 if "IETF RFC" in prompt else (text2 if "https://example.com" in prompt else text3),
            "substantive": True,
            "explanation": "Mocked consensus response"
        })

        self.contract.review_sources_batch(case_id, "b1")
        case = json.loads(self.contract.cases[case_id])
        self.assertEqual(case["status"], "SOURCE_REVIEW")
        self.assertEqual(len([r for r in case["reviews"] if r["fetchStatus"] == "reviewed"]), 3)

        self.contract.seal_source_reviews(case_id)
        case = json.loads(self.contract.cases[case_id])
        self.assertEqual(case["status"], "RELATIONSHIP_REVIEW")
        self.assertEqual(len(case["relationships"]), 3)

        self.contract.review_relationship_batch(case_id, "b2")

        self.contract.finalize_case(case_id)
        final = json.loads(self.contract.cases[case_id])
        self.assertEqual(final["status"], "FINALIZED")
        report = final["report"]
        self.assertTrue(report["complete"])
        self.assertFalse(report["partial"])
        self.assertEqual(report["sourcesReviewed"], 3)
        self.assertEqual(report["primarySources"], 1)
        self.assertEqual(report["attributedSources"], 1)
        self.assertEqual(report["mentionsSources"], 1)

    def test_different_valid_quotes_supporting_same_assessment(self):
        """[REGRESSION TEST]: Two different valid verbatim quotes from the same page both support primary_reporting."""
        claim = "The domain names example.com, example.net, and example.org are reserved for documentation purposes."
        quote_a = "A number of domains such as example.com and example.org are maintained for documentation purposes."
        quote_b = "These domain names are reserved by IANA for use in illustrative examples without prior registration."
        page_text = f"Welcome to the registry. {quote_a} Additional details follow. {quote_b} End of documentation."

        MockGL._render_mock = lambda url, mode: page_text

        # Validator 1 extracts quote_a
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "primary_reporting",
            "exact_quote": quote_a,
            "substantive": True,
            "explanation": "Anchored primary excerpt A."
        })
        res_a = json.loads(self.contract._analyze("https://iana.org/domains", claim))
        self.assertEqual(res_a["status"], "reviewed")
        self.assertEqual(res_a["stance"], "primary_reporting")
        self.assertEqual(res_a["contributions"][0]["quote"], quote_a)

        # Validator 2 extracts quote_b
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "primary_reporting",
            "exact_quote": quote_b,
            "substantive": True,
            "explanation": "Anchored primary excerpt B."
        })
        res_b = json.loads(self.contract._analyze("https://iana.org/domains", claim))
        self.assertEqual(res_b["status"], "reviewed")
        self.assertEqual(res_b["stance"], "primary_reporting")
        self.assertEqual(res_b["contributions"][0]["quote"], quote_b)

        # Both assessments agree on status and stance
        self.assertEqual(res_a["status"], res_b["status"])
        self.assertEqual(res_a["stance"], res_b["stance"])

    def test_first_party_statement_citing_standards_preserves_primary_reporting(self):
        """[REGRESSION TEST]: First-party statement citing RFC/standards retains primary_reporting."""
        claim = "The domain names example.com, example.net, and example.org are reserved for documentation purposes."
        quote = "As described in RFC 2606, a number of domains such as example.com are maintained for documentation purposes."
        page_text = f"Official Registry: {quote} Published by the authority."

        MockGL._render_mock = lambda url, mode: page_text
        MockGL._llm_mock = lambda prompt, rf: json.dumps({
            "stance": "primary_reporting",
            "exact_quote": quote,
            "substantive": True,
            "explanation": "Primary declaration referencing formal RFC standard."
        })
        res = json.loads(self.contract._analyze("https://iana.org/domains/reserved", claim))
        self.assertEqual(res["status"], "reviewed")
        self.assertEqual(res["stance"], "primary_reporting")
        self.assertEqual(len(res["contributions"]), 1)
        self.assertIsNone(res["contributions"][0]["originUrl"])

    def test_contradictory_assessments_criteria_check(self):
        """[REGRESSION TEST]: Validates that CRITERIA explicitly marks contradictory stances as non-equivalent."""
        self.assertIn("Materially inconsistent stances", echotrace.CRITERIA)
        self.assertIn("Different verbatim quote selections", echotrace.CRITERIA)
        self.assertIn("primary_reporting vs unrelated", echotrace.CRITERIA)

if __name__ == "__main__":
    unittest.main()
