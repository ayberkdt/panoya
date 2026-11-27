# Personal Workspace — geliştirme spesifikasyonu

Sürüm: 1.0 | Tarih: 2026-11-27 | Ürün adı: henüz seçilmedi. `workspace` yalnızca teknik çalışma adı.

Amaç: Google Colab benzeri sıralı, hesaplanabilir hücreleri; hızlı not, link, e-posta taslağı, klasör/defter, veri analizi ve kişisel finans özellikleriyle birleştiren çevrimdışı öncelikli kişisel çalışma alanı. Bu paket çalışan uygulama değil; kodlama ajanına verilecek uygulanabilir geliştirme planıdır.

## Başlatma
1. ZIP'i hedef repo köküne aç; dokümanları `spec/` altında tutabilirsin.
2. `AGENTS.md` talimatını repo köküne kopyala (mevcut talimatları silme; çelişki varsa kaydet).
3. `00_EXECUTION.md` ve `01_PRODUCT.md` ile başla; ardından numaralı dosyaları aşama sırasına göre uygula.
4. Her aşamanın kabul testleri geçmeden bağımlı aşamaya geçme. Yerel çalışma için bulut hesabı veya ücretli servis gerekmez.
5. `PROGRESS.md` dosyasını her aşamada güncelle. Sadece gerçekten çalışan özellikleri tamamlandı işaretle.

## Belgeler ve bağımlılıklar
| Dosya | Konu | Aşama |
|---|---|---|
| 00_EXECUTION | Ajan yürütme planı ve kapılar | tümü |
| 01_PRODUCT | Ürün kapsamı, kullanıcı senaryoları | 0 |
| 02_ARCHITECTURE | Teknoloji, repo yapısı, kararlar | 0 |
| 03_DATA_MODEL | Kimlikler, kayıtlar, şemalar | 1 |
| 04_LOCAL_STORAGE | IndexedDB, transaction, autosave, geçmiş | 1 |
| 05_BLOCK_ENGINE | Blok sözleşmeleri, registry, taşıma | 1 |
| 06_EDITOR | Rich text, Markdown, LaTeX, kod | 2 |
| 07_WORKSPACE_UI | Navigasyon, klasör/defter/sayfa, responsive UX | 2 |
| 08_LINKS_COPY_MAIL | Linkler, kopyalama, mail taslakları | 2 |
| 09_SEARCH_CAPTURE | Arama, etiket, favori, inbox | 3 |
| 10_TABLE_DATA | Tablolar, veri seti, CSV/XLSX | 3 |
| 11_COMPUTATION | Güvenli formüller, tipler, DAG | 4 |
| 12_STATISTICS | İstatistik, regresyon, histogram | 4 |
| 13_CHARTS | Grafik motoru ve etkileşim | 4 |
| 14_FINANCE_FX | Çoklu döviz, portföy, kur sağlayıcısı | 5 |
| 15_MOBILE_PWA | Mobil, offline, kurulum ve güncelleme | 5 |
| 16_CLOUD_SYNC | Auth, Supabase, sync protokolü, conflict | 6 |
| 17_FILES_EXPORT | Ekler, yedek, import/export | 3 ve 6 |
| 18_ACADEMIC | Akademik ve bilimsel bloklar | 7 |
| 19_EXTENSIONS | Şablonlar, eklenti sistemi, gelecekteki API | 7 |
| 20_SECURITY | Güvenlik, gizlilik, tehdit modeli | tümü |
| 21_TEST_QA | Test matrisi, benchmark, kabul | tümü |
| 22_DEPLOYMENT | CI, hosting, yayın, operasyon | 8 |
| 23_DEMO_FIXTURES | Uçtan uca doğrulanabilir örnekler | tümü |
| 24_ROADMAP | MVP, öncelikler, backlog | tümü |
| 25_REFERENCES | Resmi teknik kaynaklar | tümü |
| AGENTS / PROGRESS | Ajan kuralları / takip şablonu | tümü |

## Kritik kararlar
- Tek kullanıcılı, kişisel, Türkçe/İngilizce, responsive PWA; gerçek zamanlı çok kullanıcılı işbirliği kapsam dışı.
- Sayfa blok kayıtlarının sıralı birleşimidir. Tiptap JSON yalnızca rich-text blok içinde tutulur; sayfanın ikinci bir kanonik editör belgesi yoktur.
- Yerel veri kanonik çalışma kopyasıdır; bulut isteğe bağlı senkronizasyon ve yedek değildir. Ayrı dışa aktarma gerekir.
- Finans: manuel kayıt, referans kuru, net değer; banka bağlantısı ve ödeme yok. Hesaplanabilir bloklar güvenli ve deterministik olmalı.
- Code block başlangıçta yalnızca görüntüleme/kopyalama içindir. Python/Jupyter yürütme, dış entegrasyon, üçüncü taraf eklenti yürütme sonraki kararlar.
- Teknoloji sürümlerini uygulama sırasında resmi doküman ve uyumlulukla seç; lockfile sabitle. Ücretsiz hizmet limitleri değişebilir.
