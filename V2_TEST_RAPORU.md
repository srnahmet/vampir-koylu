> Bu belge önceki V2 sürümünün kaydıdır. Güncel kurallar ve doğrulama için [V2.1 rehberine](V2_1_KURALLAR_VE_TESTLER.md) bakın.

# V2.0.1 test ve oyun kuralı denetimi

## Kapsam

| Katman | Denetim |
| --- | --- |
| Rol havuzu | Sekiz isteğe bağlı rolün üç ayarı için 3⁸ = 6.561 yapılandırma; her biri 0–23 boş yerle sınandı: **157.464 kombinasyon**. |
| Olasılık | Sabit tohumlarla üç ayrı havuzda 4.096'şar, toplam **12.288 çekiliş**. Kesin rol taşması, boş kapasitede %50 seçimi ve rastgele rol taşması ayrı incelendi. Her rolün sırası yerine eşit öncelikli örnekleme kullanılır. |
| Gece çözümü | İki farklı hedefin sırası, doktor ve korumanın hedefleri için **1.680 kombinasyon**, sunucu çözümünden bağımsız eşzamanlı ölüm modeliyle karşılaştırıldı. |
| Yetkiler | On karakter × 13 aşama × dokuz hamle = **1.170 izin denemesi**, gerçek `authenticated` veritabanı rolüyle yapıldı. |
| Tam oyunlar | Sabit tohumlu **84 oyun**, 4–24 oyuncu, tek/iki vampir, tüm yeni roller, konuşma sıraları ve bağlantı kopmalarıyla baştan sona public RPC'lerden oynatıldı. Her oyun 300 sürücü adımı içinde tamamlandı. |
| Sınır durumları | Eksik vampir seçimi, iki hedefin ayrılması, son Avcı hedefinin ayrılması, tekrar eşitlik, rol gizliliği, eski aşama numaraları, ikinci atış, susturma, çapraz masa hedefi, rövanş ve tema/rol sıfırlama için ayrı regresyon testleri var. |
| Geçiş | V1 → V2 ve V2 → V2.0.1 SQL geçişleri yeniden çalıştırıldı; mevcut rollerin, masanın ve hedef önerilerinin korunduğu doğrulandı. |

## Düzeltilen sorunlar

- Fazla kesin rol seçilmesi oyunun başlamasını engelliyordu: artık mevcut yerlere uygun gizli çekiliş yapılıyor. Kesin roller sığıyorsa korunuyor. Yer kalırsa %50 havuzuna giren rollerden eşit öncelikli seçim yapılıyor; kod sırasındaki rollerin avantajı kaldırıldı.
- Taşmada dağıtılmayan kesin gece rolleri, aşama süresinden anlaşılabiliyordu. İlgili boş aşamalar da aynı süreyi bekliyor.
- Koruma hem kendisi hem koruduğu oyuncu hedef olduğunda, saldırıların işlenme sırası sonucu değiştiriyordu. Gece saldırıları aynı başlangıç durumuna göre çözülüyor.
- Avcının son oku ekranında tüm yaşayanların ayrılması oyunu takabiliyordu. Bekleyen atış temizleniyor ve oyun sonuçlandırılıyor.
- Yalnızca vampir takımı kalan bir oyun gündüz devam edebiliyordu. Artık sonuç hemen belirleniyor.
- İki vampirden biri veya ikisi hiç hedef seçmezse gece sınırsız bekleyebiliyordu. Süre sonunda geçerli önerilerden, hiç öneri yoksa uygun hedeflerden seçim yapılıyor; otomatik seçim özette işaretleniyor.
- Ayrılan Koruma/Doktor/Şamanın sonuçlanmamış yeteneği özette geçerli görünebiliyordu. İptal edilen hamleler ayrıştırılıyor; doktorun iptal edilen kendini koruma hakkı yalnızca bir kez iade ediliyor.

## Tekrar üretme

```sh
npm ci
npm test
npm run build
```

Odaklı denetim dosyaları: `tests/v2-adversarial.test.mjs`, `tests/v2-combinatorial.test.mjs`, `tests/v2-permissions-matrix.test.mjs`, `tests/v2-simulation.test.mjs`, `tests/v2-upgrade.test.mjs`.

## Testlerin sınırı

Bu rapor belirli durum uzaylarını tüketen kontrolleri ve tekrarlanabilir simülasyonları kapsar; bütün olası kullanıcı davranışları için matematiksel hatasızlık ispatı değildir. Tek vampirli gecede gerekli oyuncunun seçim yapmasını beklemek ve oyuncuların tekrar tekrar aynı eşitliği üretmesi mevcut oyun kurallarıdır. Tekrarlanan eşitlik testinde 12 tur boyunca yeni aşama numarası, doğru aday listesi ve yeni oy hakkı doğrulanır; bu, yazılımsal kilitlenmeden ayrıdır. Üretim ağ gecikmesi ve tarayıcılar arası ses aktarımı bu veritabanı simülasyonlarının kapsamı dışındadır; mevcut istemci/ses testleri ayrıca çalışır.

## Yayın

Mevcut V2 kurulumunda önce `supabase/v2-role-audit.sql`, ardından web 2.0.1 yayımlanır. Yeni kurulumda `supabase/setup.sql` veya `supabase/v2.sql` son davranışı içerir. Geçiş açık oyunları ve oyları silmez.
