# Panoya

Çevrimdışı öncelikli kişisel çalışma alanı: klasör → defter → sayfa → blok. Tıklanabilir linkler,
tek dokunuşla kopyalama, mail taslakları, yapılacaklar ve zengin metin. Veriler tarayıcının
IndexedDB'sinde, bu cihazda tutulur; hesap ya da sunucu gerekmez.

Geliştirme spesifikasyonu: [`spec/`](spec/README.md). İlerleme ve kanıtlar: [`PROGRESS.md`](PROGRESS.md).
Mimari kararlar: [`docs/adr/`](docs/adr/).

## Gereksinimler

- Node.js 24 (`.nvmrc`; Vercel'de de 24.x sabit)
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
| `corepack pnpm typecheck` | Katı TypeScript, altı proje                                   |
| `corepack pnpm test`      | Vitest birim/entegrasyon testleri                             |
| `corepack pnpm e2e`       | Playwright uçtan uca testler (Edge, masaüstü + mobil görünüm) |
| `corepack pnpm e2e:prod`  | Aynı testler üretim derlemesinde, Vercel başlıklarıyla (CSP)  |
| `corepack pnpm build`     | Üretim derlemesi: `apps/web/dist/`                            |
| `corepack pnpm check`     | kontrast + lint + typecheck + test + build                    |

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

## Vercel'e deploy

Ayarların hepsi [`vercel.json`](vercel.json)'da; panelde bir şey değiştirmen gerekmez.

1. Vercel → **Add New… → Project** → GitHub'dan `ayberkdt/panoya` deposunu içe aktar.
2. **Root Directory**: depo kökü (boş bırak). Framework Preset "Other" olarak gelir.
3. Ortam değişkeni yok. **Deploy**.

`vercel.json` şunları sabitler:

- Kurulum `npx --yes pnpm@12.23.0 install --frozen-lockfile` (Vercel'in kendi pnpm sürümü değil,
  `packageManager` ile aynı sürüm), derleme `kontrast kapısı + vite build`, çıktı `apps/web/dist`.
- Tek sayfa uygulama yönlendirmesi: `/w/…/p/…` gibi derin linkler doğrudan açılır (var olan
  dosyalar önce sunulur, kalan her yol `index.html`'e düşer).
- Güvenlik başlıkları: sıkı CSP (`script-src 'self'`, `style-src 'self'`, dış bağlantı yok),
  `nosniff`, `frame-ancestors 'none'`, HSTS, kapalı kamera/mikrofon/konum izinleri.
- `/assets/*` (hash'li dosyalar) bir yıl önbelleklenir; `index.html` her açılışta yeniden doğrulanır.

Deploy öncesi yerelde aynı başlıklarla denemek için: `corepack pnpm e2e:prod` (derler,
`vite preview` ile 4173'te sunar, CSP ihlali olursa test düşer). Başlıklar tek kaynaktan,
`vercel.json`'dan okunur.

**Önemli:** deploy verileri taşımaz. Notlar her tarayıcının kendi IndexedDB'sindedir; telefon
ve bilgisayar aynı adresi açsa da ayrı çalışma alanları görür. Cihazlar arasında taşımak için
şimdilik çalışma alanı menüsü → Yedeği indir (.zip) → diğer cihazda Yedekten geri yükle. Ortak senkron G6 aşamasında (Supabase).

## Bilinen sınırlar

- Veriler yalnız bu tarayıcıdadır. Tarayıcı verisini temizlemek, gizli pencere ya da depolama
  tahliyesi notları silebilir; düzenli ZIP yedeği al (kenar çubuğunda çalışma alanı menüsü → Yedeği indir).
- Henüz service worker yok: uygulama çevrimdışı ilk açılışta yüklenmez ve "ana ekrana yükle"
  tam PWA olarak kurulmaz (G5).
- Gerçek iPhone/Android cihaz testi henüz yapılmadı; mobil yalnız emülasyonla doğrulandı.
