# Security Policy

## Reporting Security Issues

Please do not report security vulnerabilities via public GitHub issues, discussions, or pull requests.

To report a vulnerability:
1. Open a confidential report through GitHub Private Vulnerability Reporting on this repository if enabled, OR
2. Contact the repository maintainers privately via repository owner channels.

Include in your report:
- Type of vulnerability (e.g., SSRF, XSS, contract logic bug, private data leakage).
- Affected file paths, methods, or endpoints.
- Step-by-step reproduction instructions or a minimal proof of concept.
- Potential impact.

Maintainers will review the submission and respond with an acknowledgment.

## Threat Model & Known Constraints

1. **Host & URL Filtering:**
   EchoTc accepts only public `https://` URLs for claims and source reviews. Private IP literals, loopbacks, octal/hex encodings, credentials, and non-ASCII hostnames are rejected by policy. However, external DNS rebinding cannot be prevented by frontend checks alone.

2. **Off-Chain Rendering:**
   Direct Mode relies on local mock/fixture or client-side fetch restrictions. Studionet relies on GenLayer consensus nodes executing `gl.nondet.web.render`.

3. **No Centralized Custody:**
   EchoTc does not hold user funds or custody private keys. All blockchain interactions occur client-side via user-approved wallet signatures.
