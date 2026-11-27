# Panoya

Çevrimdışı öncelikli kişisel çalışma alanı: klasör → defter → sayfa → blok. Tıklanabilir linkler,
tek dokunuşla kopyalama, mail taslakları, yapılacaklar ve zengin metin. Veriler tarayıcının
IndexedDB'sinde, bu cihazda tutulur; hesap ya da sunucu gerekmez.

Geliştirme spesifikasyonu: [`spec/`](spec/README.md). İlerleme ve kanıtlar: [`PROGRESS.md`](PROGRESS.md).
Mimari kararlar: [`docs/adr/`](docs/adr/).

## Gereksinimler

- Node.js ≥ 24 (`.nvmrc`)
- pnpm 12.23.0, Node ile gelen **corepack** üzerinden (`packageManager` alanında sabit).
  Global kurulum gerekmez: komutları `corepack pnpm …` diye çalıştır. İstersen bir kez
  `corepack enable` ile `pnpm` kısayolunu açabilirsin (Windows'ta yönetici izni isteyebilir).
- E2E testleri için Microsoft Edge (Windows'ta hazır gelir). Paketli Chromium kullanmak için:
  `corepack pnpm exec playwright install chromium` ve `PW_CHANNEL=chromium`.

## Komutlar

| Komut                     | Ne yapar                                                      |
| ------------------------- | ------------------------------------------------------------- |
| `corepack pnpm install`   | Bağımlılıkları kilit dosyasına göre kurar                     |
| `corepack pnpm dev`       | Geliştirme sunucusu: http://localhost:5173                    |
| `corepack pnpm lint`      | ESLint (modül sınırları dahil)                                |
| `corepack pnpm typecheck` | Katı TypeScript, dört paket                                   |
| `corepack pnpm test`      | Vitest birim/entegrasyon testleri                             |
| `corepack pnpm e2e`       | Playwright uçtan uca testler (Edge, masaüstü + mobil görünüm) |
| `corepack pnpm build`     | Üretim derlemesi: `apps/web/dist/`                            |
| `corepack pnpm check`     | lint + typecheck + test + build                               |

## Yapı

```text
apps/web            React arayüzü (yalnız komut çalıştırır, veritabanına dokunmaz)
packages/domain     Saf alan modeli: varlıklar, şemalar (Zod), sıralama, komut planlayıcı
packages/blocks     Blok kayıt defteri ve tanımları, URL güvenliği, serileştirme
packages/storage    Depolama: Dexie (IndexedDB) ve bellek arka ucu, geçmiş/geri alma, otomatik kayıt
fixtures/           Sentetik test verileri (gerçek kişisel veri yok)
tests/e2e/          Playwright senaryoları
spec/               Geliştirme spesifikasyonu (değiştirilmeden saklanır)
```

Veri akışı: arayüz niyeti → doğrulanmış komut → tek IndexedDB işlemi (kayıtlar + komut günlüğü)
→ değişiklik bildirimi → görünüm yeniden yüklenir. Ayrıntı: [ADR-003](docs/adr/ADR-003-command-pipeline-and-undo.md).

## Bilinen sınırlar

- Veriler yalnız bu tarayıcıdadır. Tarayıcı verisini temizlemek, gizli pencere ya da depolama
  tahliyesi notları silebilir. Yedekleme/dışa aktarma G3 aşamasında gelecek.
- Gerçek iPhone/Android cihaz testi henüz yapılmadı; mobil yalnız emülasyonla doğrulandı.
