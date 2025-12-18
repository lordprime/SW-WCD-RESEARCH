 
### Service Worker–Mediated Web Cache Deception  

This repository contains a **controlled research prototype** used to study how **Service Workers (SWs)** can influence **Web Cache Deception (WCD)** behaviors in modern **CDN-backed web architectures**.


## 📂 Directory Structure and Purpose

```
SW-WCD-RESEARCH/
│
├── analysis/               # Statistical & experimental analysis
├── db/                     # Experiment data storage
├── infrastructure/         # CDN & deployment simulation
├── monitoring/             # Instrumentation & detection
├── origin/                 # Vulnerable origin server
├── sw/                     # Service Worker attack payloads
├── scripts/                # Setup & cleanup utilities
├── tests/                  # Automated experiment execution
├── logs/                   # Runtime logs
├── test-results/           # Structured test outputs
│
├── .env                    # Environment configuration
├── package.json            # Root dependencies
├── package-lock.json       # Dependency locking
└── safety.md               # Safety & ethical guidelines
```

---

###  `analysis/` — Statistical & Experimental Analysis

Scripts used **after experiments** to analyze results.

- **`power-analysis.R`**:  
  Performs power analysis to determine required sample sizes and validate statistical significance of attack success rates.

- **`statistical-engine.js`**:  
  Aggregates experiment outputs and computes metrics: success rate, time-to-cache, CDN/browser comparisons.

> **Why?** Security papers require quantitative evidence. This supports reproducible, statistically sound evaluation.

---

###  `db/` — Experiment Data Storage

Defines how experimental data is stored and queried.

- **`schema.sql`**:  
  PostgreSQL schema for trials, headers, outcomes, and metadata.

- **`queries.js`**:  
  Reusable query layer for analysis and reporting.

> **Why?** Experiments generate structured data that must be queried consistently across runs.

---

###  `infrastructure/` — CDN & Deployment Simulation

Simulates real-world infrastructure components.

- **`docker-compose.yml`**:  
  Orchestrates origin server, PostgreSQL, pgAdmin, and Nginx CDN simulator.

- **`nginx-cdn-simulator.conf`**:  
  Simulates CDN caching logic (e.g., `.jpg`/`.css` caching, TTLs, Cache Deception Armor bypass logic).

> **Why?** Real CDNs are opaque. This provides **controlled, inspectable behavior** for experimentation.

---

### `monitoring/` — Instrumentation & Detection

Observes system behavior during attacks.

- **`request-logger.js`**:  
  Logs all requests, rewritten URLs, headers, user context, and cache indicators.

- **`anomaly-detector.js`**:  
  Detects abnormal patterns (e.g., external domain contact, unexpected attack success, high request rates).

> **Why?** Ensures experiments are **observable, debuggable, and auditable**.

---

###  `origin/` — Vulnerable Origin Server

Express-based web app under test.

- **`server.js`**:  
  Serves sensitive endpoints: `/account`, `/api/user`, `/api/reflect`.

- **`strategies.js`**:  
  Defines header strategies: `proper`, `misconfigured`, `missing`, `conflicting`.

- **`middleware/rate-limiter.js`**:  
  Enforces strict rate limits (5 req/60s) to prevent abuse.

- **`origin/sw/`**:  
  Hosts SW payloads served by the origin (for registration via `/sw/*`).

> **Why?** WCD feasibility depends on origin behavior. This enables **systematic variation**.

---

### `sw/` — Service Worker Attack Payloads

Client-side SW implementations for different attack classes:

- **`t1-path-sculpting.js`**: URL rewriting + Content-Type spoofing.
- **`t2-header-manipulation.js`**: Header injection to trigger origin reflection.
- **`t4-scope-misconfig.js`**: Path normalization to induce cache collisions.

> **Note**: Duplicated relative to `origin/sw/` to reflect **different deployment contexts**.

> **Why?** SWs are the **core research subject**—this isolates logic for clarity and reuse.

---

###  `scripts/` — Setup & Cleanup Utilities

Ensures safe, repeatable experiments.

- **`setup-mkcert.sh`**: Generates trusted local TLS certs (HTTPS required for SWs).
- **`init-db.js`**: Initializes PostgreSQL schema.
- **`cleanup-sw.js`**: Unregisters SWs, purges old data, validates safety.

> **Why?** Prevents accidental state persistence and ensures **reproducibility**.

---

###  `tests/` — Automated Experiment Execution

Playwright-based test suite for end-to-end validation.

- **`attack.spec.js`**: Executes full attack matrix (victim → cache poison → attacker retrieval).
- **`verify-sw.spec.js`**: Validates SW installation, scope, and interception.
- **`utils.js`, `config.js`**: Shared helpers and test matrix config.
- **`playwright.config.js`**: Browser automation (Chromium, Firefox, WebKit).

> **Why?** Automated testing across CDNs, browsers, and strategies is essential for **scientific validity**.

---

### `logs/` and `test-results/`

- **`logs/`**: Runtime logs from origin, CDN, and monitoring.
- **`test-results/`**: Structured outputs (HTML/JSON reports, traces, videos).

> **Why?** Separates **raw data** from **analysis logic**.

---

---
### Root Files

- ** `.env `** : Environment configuration

- ** `package_json `**: Dependencies

- ** ` Safety.md `**: Ethical constraints and cleanup guarantees

---

##  Essential Commands Cheat Sheet

###  1. Initial Setup (Run Once)
```bash
git clone <repo-url> sw-wcd-research && cd sw-wcd-research

# Install dependencies
npm install
cd origin && npm install && cd ..
cd tests && npm install && cd ..
```

### 2. Configure Hosts File (Mandatory)
**Windows (as Administrator):**  
Edit `C:\Windows\System32\drivers\etc\hosts`  
**macOS/Linux:**  
Edit `/etc/hosts`

Add:
```
127.0.0.1 cdn-simulator.local
```

Flush DNS:
```bash
# Windows
ipconfig /flushdns
# macOS/Linux
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```


### 4. HTTPS Certificate Setup
> Required for Service Workers

```bash
# Install mkcert if not present
brew install mkcert               # macOS
sudo apt install libnss3-tools    # Ubuntu/Debian

mkcert -install
mkcert -key-file ssl/key.pem -cert-file ssl/cert.pem \
  localhost 127.0.0.1 cdn-simulator.local
```

###  5. Start Infrastructure
```bash
npm run infra:up
# Wait ~10 seconds for containers to initialize
```

###  6. Initialize Database
```bash
npm run db:init
```

###  7. Start Origin Server
```bash
# Terminal 1
npm run dev
# → https://localhost:3443
```

###  8. Run Local Tests
```bash
# Terminal 2
npm run test:local
# → Uses CDN simulator: https://cdn-simulator.local
```

###  9. Analyze Results
```bash
npm run analyze
npx playwright show-report test-results/reports/html-report
```

###  10. Cleanup
```bash
npm run infra:down
node scripts/cleanup-sw.js
```
> **Manual step**:  
> Open DevTools → Application → Service Workers → **Unregister**

###  11. Debugging
```bash
docker ps
docker logs infrastructure-postgres-1
docker logs infrastructure-nginx-1
curl -k https://localhost:3443/health
curl https://cdn-simulator.local/health
```

###  12. Common Issues

| Issue | Fix |
|------|-----|
| `ERR_NAME_NOT_RESOLVED` | Add `cdn-simulator.local` to `/etc/hosts` |
| `ERR_CONNECTION_REFUSED` | Ensure `npm run infra:up` succeeded |
| `Module not found: pg` | Run `npm install pg` in root and `origin/` |
| Playwright import errors | Use **static ES imports** only |
| HTML report path conflict | Ensure `outputDir` in `playwright.config.js` points to `test-results/` |

---

## Minimal Working Command Flow

```bash
npm install
npm run infra:up
npm run db:init
npm run dev              # Terminal 1
npm run test:local       # Terminal 2
```

---

##  Safety & Ethics

This system includes **built-in safeguards**:

- **Auto-unregister**: All Service Workers self-destruct after 5 minutes.
- **Rate limiting**: Enforced at origin (5 req/60s).
- **Data retention**: Auto-purge after 30 days.
- **Domain allowlisting**: Blocks external requests.
