# FuncLib v4 - Kullanım Kılavuzu

**AI-Powered Code Intelligence & Reference Tracking System**

Tree-sitter tabanlı AST parse ile %99+ doğruluk oranında kod analizi.

---

## ⚠️ KRİTİK KURAL

**Bir fonksiyonu, method'u, class'ı veya component'ı değiştirmeden ÖNCE mutlaka:**

```bash
funclib refs <sembol_adı>
```

Bu kural tüm diller için geçerlidir: JavaScript, TypeScript, Python, Go, Rust, Java, C#, PHP, Ruby, Vue...

---

## 🚀 Hızlı Başlangıç

```bash
# 1. Projeyi indeksle
funclib index

# 2. Sembol ara
funclib search handleSubmit

# 3. Referansları bul (EN ÖNEMLİ!)
funclib refs handleSubmit

# 4. Değişiklik yap ve tüm kullanım yerlerini güncelle
```

---

## 📋 Tüm CLI Komutları

### 🔷 Core Commands (Kod Analizi)

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `funclib index` | Projeyi indeksle | `funclib index` |
| `funclib search <query>` | Sembol ara | `funclib search handleSubmit` |
| `funclib refs <name>` | ⚠️ Tüm referansları bul | `funclib refs fetchData` |
| `funclib symbol <name>` | Sembol detayları | `funclib symbol UserService` |
| `funclib file <path>` | Dosyadaki semboller | `funclib file src/utils.ts` |
| `funclib list [kind]` | Sembolleri listele | `funclib list function` |
| `funclib stats` | İndeks istatistikleri | `funclib stats` |
| `funclib watch` | Değişiklikleri izle | `funclib watch` |

---

### 🔷 PIE Commands - Faz 1 (Project Registry)

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `funclib register <id>` | Yeni proje kaydet | `funclib register gsb --root ./project --type vue` |
| `funclib projects` | Kayıtlı projeleri listele | `funclib projects` |
| `funclib project <id>` | Proje detayları | `funclib project gsb` |
| `funclib pie-index <id>` | Projeyi indeksle | `funclib pie-index gsb` |
| `funclib unregister <id>` | Projeyi kaldır | `funclib unregister gsb` |

---

### 🔷 Trace Commands - Faz 2 (Runtime Tracing)

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `funclib trace-start <id>` | Trace toplamayı başlat | `funclib trace-start gsb` |
| `funclib trace-stop <id>` | Trace toplamayı durdur | `funclib trace-stop gsb` |
| `funclib traces <id>` | Trace run'larını listele | `funclib traces gsb` |
| `funclib trace <id> <runId>` | Trace detayları | `funclib trace gsb run-123` |
| `funclib trace-errors <id>` | Son trace hataları | `funclib trace-errors gsb` |

---

### 🔷 Scenario Commands - Faz 3 (Scenario Runner)

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `funclib scenario-list <id>` | Senaryoları listele | `funclib scenario-list gsb` |
| `funclib scenario-run <id> <s>` | Senaryo çalıştır | `funclib scenario-run gsb image_upload` |
| `funclib scenario-all <id>` | Tüm senaryoları çalıştır | `funclib scenario-all gsb` |
| `funclib scenario-results <id>` | Sonuçları listele | `funclib scenario-results gsb` |
| `funclib scenario-result <id> <runId>` | Sonuç detayları | `funclib scenario-result gsb run-123` |

---

### 🔷 Context Commands - Faz 4 (Context Synthesizer)

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `funclib analyze <id> <runId>` | Context sentezle | `funclib analyze gsb run-123` |
| `funclib graph <id> <runId>` | Journey graph göster | `funclib graph gsb run-123` |
| `funclib flows <id> <runId>` | Kod akışları | `funclib flows gsb run-123` |
| `funclib failures <id> <runId>` | Tespit edilen hatalar | `funclib failures gsb run-123` |
| `funclib evidence <id> <runId>` | Evidence pack | `funclib evidence gsb run-123` |

---

### 🔷 Impact Commands - Faz 5 (Impact Analyzer)

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `funclib blast-radius <symbol>` | Blast radius hesapla | `funclib blast-radius uploadImage` |
| `funclib file-impact <file>` | Dosya etkisi | `funclib file-impact src/upload.ts` |
| `funclib impact-project <id> <s>` | Proje bazlı etki | `funclib impact-project gsb useStore` |
| `funclib affected-ui <symbol>` | Etkilenen UI | `funclib affected-ui handleSubmit` |
| `funclib risk-assess <symbol>` | Risk değerlendirmesi | `funclib risk-assess uploadFile` |

---

### 🔷 Narration Commands - Faz 6 (LLM Report)

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `funclib narrate <id> <runId>` | LLM ile rapor üret | `funclib narrate gsb run-123` |
| `funclib report <id> <runId>` | Raporu göster | `funclib report gsb run-123` |
| `funclib fix-plan <id> <runId>` | Düzeltme planı | `funclib fix-plan gsb run-123` |
| `funclib suggest-tests <id> <runId>` | Test önerileri | `funclib suggest-tests gsb run-123` |
| `funclib llm-check` | LLM durumu | `funclib llm-check` |

---

### 🔷 Learning Commands - Faz 7 (Learning Loop)

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `funclib learn [id]` | Geçmişten öğren | `funclib learn gsb` |
| `funclib feedback <id> <runId>` | Fix sonucu kaydet | `funclib feedback gsb run-123 success` |
| `funclib patterns` | Pattern'leri göster | `funclib patterns` |
| `funclib suggest <error>` | Düzeltme öner | `funclib suggest "415 Unsupported Media"` |
| `funclib learning-stats` | Öğrenme istatistikleri | `funclib learning-stats` |
| `funclib memory <query>` | Memory'den hatırla | `funclib memory "upload error"` |

---

### 🔷 AI Commands

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `funclib ask <question>` | Kod hakkında soru sor | `funclib ask "sepete ürün ekleme?"` |
| `funclib impact <symbol>` | Değişiklik etkisi | `funclib impact useEditorStore` |
| `funclib bugs [file]` | Bug tahminleri | `funclib bugs src/services/` |
| `funclib hotspots` | Sık değişen dosyalar | `funclib hotspots` |
| `funclib complexity <file>` | Kod karmaşıklığı | `funclib complexity src/utils.ts` |
| `funclib markers` | TODO/FIXME/HACK bul | `funclib markers` |
| `funclib guide <file>` | Dosya rehberi | `funclib guide src/upload.ts` |
| `funclib multi-ask <q>` | Multi-model ensemble | `funclib multi-ask "bu ne yapıyor?"` |
| `funclib mesh <q>` | Mesh engine (consensus) | `funclib mesh "nasıl optimize ederim?"` |
| `funclib llm-status` | LLM providers durumu | `funclib llm-status` |

---

### 🔷 Server Commands

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `funclib serve` | REST API başlat (port 3456) | `funclib serve` |
| `funclib mcp` | MCP server başlat (port 3457) | `funclib mcp` |

---

## 🔄 Doğru Workflow (Kod Değiştirme)

```bash
# 1. Önce referansları bul
funclib refs handleSubmit
# → Sonuç: "1 definition, 8 references"

# 2. Tüm 8 kullanım yerini not et:
#    - src/auth.ts:45
#    - src/profile.ts:23
#    - src/settings.ts:78
#    - ...

# 3. Fonksiyon tanımını değiştir

# 4. TÜM 8 kullanım yerini güncelle

# 5. Tekrar kontrol et
funclib refs handleSubmit
```

---

## 💡 Pro İpuçları

### Dead Code Bulma
```bash
funclib refs unusedFunction
# → 0 references = kullanılmayan kod, silinebilir
```

### Component Bağımlılıkları
```bash
funclib refs MyComponent
# → Hangi dosyalarda kullanıldığını gösterir
```

### Composable Etki Alanı
```bash
funclib refs useMyComposable
# → Hangi component'lar etkilenecek
```

### Dosya Analizi
```bash
funclib file src/utils.ts
# → Dosyadaki tüm sembolleri listeler
```

---

## 🌍 Environment Variables

```bash
FUNCLIB_PROJECT    # Proje dizini (default: cwd)
PORT               # REST API port (default: 3456)
MCP_PORT           # MCP server port (default: 3457)
GROQ_API_KEY       # Groq API key (opsiyonel)
```

---

## 🎯 Desteklenen Sembol Türleri

| Tür | Açıklama | Örnek |
|-----|----------|-------|
| `component` | Vue component'ları | `EditorShell`, `StageCanvas` |
| `hook` | Composable'lar (useXxx) | `useEditorStore`, `useTemplate` |
| `function` | Fonksiyonlar | `calculatePrice`, `formatDate` |
| `method` | Class method'ları | `store.addImage()` |
| `interface` | TypeScript interface'leri | `Product`, `SheetConfig` |
| `type` | Type alias'ları | `EditorMode`, `ToolType` |
| `class` | Class tanımları | `UserService`, `ApiClient` |
| `variable` | Değişkenler | `config`, `defaultOptions` |
| `constant` | Sabitler | `API_URL`, `MAX_SIZE` |

---

## 🗣️ Desteklenen Diller

| Dil | Uzantılar |
|-----|-----------|
| JavaScript | .js, .mjs, .cjs |
| TypeScript | .ts, .tsx |
| Python | .py |
| Go | .go |
| Rust | .rs |
| Java | .java |
| Kotlin | .kt |
| C# | .cs |
| C/C++ | .c, .cpp, .h |
| PHP | .php |
| Ruby | .rb |
| Swift | .swift |
| Dart | .dart |
| Vue | .vue |

---

## ❌ YAPMA!

- ❌ `funclib refs` çalıştırmadan fonksiyon signature'ı değiştirme
- ❌ Sadece tanımı değiştirip çağrı noktalarını unutma
- ❌ "Muhtemelen başka yerde kullanılmıyor" varsayımı
- ❌ Component rename'i manuel yapma (refs ile kontrol et)

---

## ✅ YAP!

- ✅ Her değişiklikten önce `funclib refs` çalıştır
- ✅ Tüm kullanım yerlerini not al
- ✅ Değişiklikten sonra tekrar `refs` ile kontrol et
- ✅ Dead code temizliği için 0 reference olanları bul

---

## 📊 Örnek Çıktılar

### `funclib refs useEditorStore`
```
Symbol: useEditorStore
Type: hook
File: src/composables/useEditorStore.ts:15

Definitions: 1
References: 35

References:
  src/components/EditorShell.vue:23
  src/components/StageCanvas.vue:45
  src/components/ToolPanel.vue:12
  src/pages/editor/[id].vue:34
  ...
```

### `funclib stats`
```
FuncLib Index Statistics
========================
Files:       720
Symbols:     9159
References:  22701
Languages:   typescript(7569), vue(1143), javascript(439)
Components:  165
Hooks:       30+
```

---

## 🔗 MCP Entegrasyonu

VS Code veya Claude Desktop için MCP konfigürasyonu:

```json
{
  "mcpServers": {
    "funclib": {
      "url": "http://localhost:3457"
    }
  }
}
```

---

## 📡 REST API

MCP yoksa REST API kullanılabilir:

```bash
# Arama
curl "http://localhost:3456/search?q=handleSubmit"

# Referanslar
curl "http://localhost:3456/refs/handleSubmit"

# Sembol detayı
curl "http://localhost:3456/symbol/UserService"

# Copilot endpoint
curl -X POST http://localhost:3456/copilot \
  -H "Content-Type: application/json" \
  -d '{"action":"refs","name":"handleSubmit"}'
```

---

**FuncLib v4** - Tree-sitter tabanlı gerçek AST parse ile %99+ doğruluk 🎯
