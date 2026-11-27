# 23 — Synthetic demos and reference acceptance fixtures

All examples fictitious; do not insert real personal data into repository. Demo opt-in, isolated workspace, reset only after confirmation.

## Demo hierarchy
```text
Üniversite/
  Linkler / Satellite Systems
  Ders notları / Rocket Propulsion
Araştırmalar/
  Makaleler / Ay yörüngesi
Finans/
  Varlıklarım / Kasım örneği
  Seyahat / Bütçe
Kişisel/
  Mail taslakları / Proje desteği
  Inbox / Hızlı notlar
```
Link block `Yoklama`, URL `https://example.invalid/attendance?course=demo#form`; second `Ders materyalleri`, `https://example.invalid/materials`. These intentionally non-resolving URLs test exact href and clipboard, not network availability. Use intercepted local test endpoint for successful navigation E2E.

Draft subject `Proje desteği hakkında`; body exact (newline after first paragraph, no implicit signature append):
```text
Hocam merhaba,

Hazırladığım örnek belgeleri ekte paylaşıyorum.

Desteğiniz için teşekkür ederim.

Saygılarımla,
```
Store no recipient or `demo@example.invalid`. Copy body assertion normalized CRLF/LF only; subject independent. Test no auto-send.

## Financial dataset
| ID | Type | Amount | Currency |
|---|---|---:|---|
| A | cash | 300 | EUR |
| B | bank | 200 | EUR |
| C (optional) | bank | 5000 | TRY |
| D (optional) | liability | 100 | EUR |
Manual snapshot EUR=1, TRY=50, USD=1.1, effective date 2026-01-02 (synthetic, not actual rate). A+B=500 EUR / 25000 TRY / proportions 60,40. A+B+C=600 EUR; with D net=500 EUR; assets chart excludes D. Travel budget 320 EUR; formula with A+B gives remaining 180 EUR. Change A=400 → remaining 280, portfolio 600 EUR without C/D. Offline stale rate indicated according to test clock. Use fake clock for all date assertions.

## Data fixture
```csv
x;y;label
1;2;bir
2;4;iki
3;6;üç
4;;eksik y
5;10;beş
;12;eksik x
```
Valid x n=5, mean 3, sample variance 2.5; paired x/y n=4, slope 2, intercept 0, r=1. Test independent x stats vs paired stats. Histogram bins count sum=5. Include quoted multiline and injection-text separate fixtures.

## End-to-end narrative
Create demo, edit link, copy draft on mobile, edit cash, see dependent chart, switch offline, create note, reopen, export ZIP, restore new workspace, compare semantic entity graphs and hashes. Enable cloud only in separate integration profile; simulate second device editing same draft and choose duplicate recovery. Add corrupted backup and malicious formula fixtures, never execute payload. Save screenshots and logs in test artifacts, redact any non-demo data.
