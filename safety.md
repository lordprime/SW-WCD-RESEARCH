# Safety and Ethical Guidelines

##  CRITICAL WARNINGS

1. **LEGAL COMPLIANCE**: This system must ONLY be used on domains you own or have explicit written permission to test. Never target third-party sites.

2. **ETHICAL BOUNDARIES**: All experiments are designed for research purposes only. Implementation on production systems without authorization may violate laws and ethical guidelines.

3. **AUTO-SAFETY FEATURES**:
   - All Service Workers auto-unregister after 5 minutes
   - Rate limiting enforced (1 request/second max)
   - All test data auto-purged after 30 days
   - Domain allowlisting prevents accidental external requests

##  Safety Enforcement

### Service Worker Self-Destruction
```javascript
// All SWs include auto-unregistration
setTimeout(() => {
  self.registration.unregister().then(() => {
    console.log('[SW-WCD] Safety: Auto-unregistered after 5 minutes');
  });
}, 300000);
```

### Rate Limiting
- Express rate limiter: 1 request/second per IP
- Playwright delays between trials: 3 seconds minimum
- Database connection pooling with limits

### Data Protection
- No real user data used in testing
- Unique markers per trial prevent cross-contamination
- PostgreSQL auto-cleanup via scheduled jobs

##  Required Precautions

1. **Before Deployment**:
   - Verify all test domains are owned by you
   - Configure CDN accounts with appropriate limits
   - Set up monitoring alerts for unusual activity

2. **During Testing**:
   - Monitor request logs for unexpected behavior
   - Use isolated browser profiles
   - Keep test scope constrained to owned domains

3. **After Testing**:
   - Run cleanup scripts to remove all SWs
   - Verify database contains only test data
   - Document any anomalies for peer review

##  Legal Compliance

This system complies with:
- Computer Fraud and Abuse Act (CFAA) guidelines
- GDPR Article 6 (lawful basis for processing)
- Academic research ethics standards
- Responsible vulnerability disclosure principles

**NEVER USE THIS SYSTEM FOR MALICIOUS PURPOSES.**
```