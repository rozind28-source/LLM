# LLM Failover MVP

Отказоустойчивая система вызова LLM с автоматическим переключением между провайдерами при сбоях и исчерпании лимитов.

## Архитектура

Система состоит из двух независимых компонентов:

```
┌─────────────────────────────────────────────────────────────┐
│                     Каталог (GitHub)                         │
│  https://raw.githubusercontent.com/mnfst/.../data.json      │
└──────────────────────────┬──────────────────────────────────┘
                           │ (cron, каждые N минут)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Компонент 1: Синхронизатор (sync)               │
│                                                             │
│  1. Загружает JSON-каталог                                   │
│  2. Читает keys.json (ключи пользователя)                    │
│  3. Сопоставляет провайдеров с ключами                       │
│  4. Генерирует pool-config.json                              │
└──────────────────────────┬──────────────────────────────────┘
                           │ (файл на диске)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Компонент 2: Рантайм (app)                      │
│                                                             │
│  • HTTP-сервис, принимает POST /chat                        │
│  • Читает pool-config.json при старте                       │
│  • Использует llm-failover для ротации ключей               │
│  • Автоматический failover при 429/401/5xx                  │
│  • Горячая перезагрузка конфигурации                         │
│  • Сохранение состояния (cooldowns) между перезапусков       │
└─────────────────────────────────────────────────────────────┘
```

## Быстрый старт

### 🚀 Запуск в один клик

**Из терминала:**
```bash
npm run launch
```

Эта команда автоматически:
1. Проверит наличие `keys.json` (создаст из примера если нет)
2. Откроет дашборд на вкладке **«⚙️ Настройка»**
3. Вы добавите API-ключи через удобную форму
4. Скачаете готовый `keys.json` одним кликом
5. Перейдёте на вкладку **«🚀 Запуск»** и нажмёте кнопку
6. Система запустит синхронизатор, сервер и откроет браузер

**Весь процесс занимает 2 минуты!** 🎉

---

### 📝 Пошаговый запуск

### 1. Клонирование и установка

```bash
git clone <repo-url>
cd llm-failover-mvp
npm install
```

### 2. Настройка ключей

```bash
# Скопировать пример
cp keys.json.example keys.json

# Отредактировать и добавить свои ключи
# Формат: { "groq": "gsk_...", "gemini": "AIza...", ... }
```

Список поддерживаемых провайдеров и где получить ключи:
- **Groq** — https://console.groq.com/keys
- **Google Gemini** — https://aistudio.google.com/app/apikey
- **OpenRouter** — https://openrouter.ai/keys
- **NVIDIA NIM** — https://build.nvidia.com/explore/discover
- **Mistral AI** — https://console.mistral.ai/api-keys

### 3. Запуск синхронизатора

```bash
npm run sync
```

Или напрямую:

```bash
node --import tsx/esm scripts/sync.ts
```

Это создаст `pool-config.json` на основе каталога и ваших ключей.

### 4. Запуск рантайма

```bash
npm start
```

Сервис поднимется на порту 3001 (или из `.env`).

### 5. Тестовый запрос

```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Привет!"}]}'
```

Ответ:
```json
{
  "content": "Привет! Чем могу помочь?",
  "provider": "groq",
  "model": "openai/gpt-oss-120b",
  "profileId": "groq-1",
  "attempts": 1,
  "failedProfiles": [],
  "durationMs": 234
}
```

## Как добавить ключ провайдера

1. Откройте `keys.json`
2. Добавьте ключ в формате: `"provider_key": "your_api_key"`
3. Запустите `npm run sync` для обновления пула
4. Рантайм подхватит автоматически (горячая перезагрузка)

Маппинг имён провайдеров:

| Провайдер в каталоге | Ключ в keys.json |
|---|---|
| Groq | `groq` |
| Google Gemini | `gemini` |
| OpenRouter | `openrouter` |
| NVIDIA NIM | `nvidia` |
| Mistral AI | `mistral` |
| Cohere | `cohere` |
| Hugging Face | `huggingface` |

## Как запустить синхронизатор по cron

### Linux/macOS (crontab)

```bash
# Обновлять пул каждые 30 минут
crontab -e
# Добавить строку:
*/30 * * * * cd /path/to/project && npm run sync >> /var/log/llm-sync.log 2>&1
```

### Windows (Планировщик задач)

1. Открыть Планировщик задач
2. Создать задачу
3. Триггер: каждые 30 минут
4. Действие: `cmd /c "cd C:\path\to\project && npm run sync"`

## API Endpoints

### POST /chat

Выполнить запрос к LLM с автоматическим failover.

**Request:**
```json
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is 2+2?"}
  ],
  "model": "optional-model-override",
  "max_tokens": 1024,
  "temperature": 0.7
}
```

**Response:**
```json
{
  "content": "2+2 equals 4.",
  "provider": "groq",
  "model": "openai/gpt-oss-120b",
  "profileId": "groq-1",
  "attempts": 1,
  "failedProfiles": [],
  "durationMs": 156
}
```

### GET /status

Показать текущее состояние пула (какие профили доступны, в cooldown, отключены).

### GET /health

Health check для мониторинга.

## Архитектура и почему так

### Почему два компонента?

- **Синхронизатор** — запускается редко (cron), не влияет на доступность сервиса.
- **Рантайм** — постоянно работает, перечитывает конфиг без перезапуска.
- Разделение позволяет обновлять каталог независимо от сервиса.

### Почему llm-failover?

- TypeScript-native, zero dependencies.
- Встроенные cooldowns с exponential backoff.
- Раздельная обработка rate_limit vs auth_permanent.
- Persistence состояния между перезапусками.

### Почему OpenAI-совместимый формат?

Большинство провайдеров (Groq, OpenRouter, NVIDIA NIM, Mistral) предоставляют `/chat/completions` endpoint. Это позволяет использовать один код для всех провайдеров.

### Почему горячая перезагрузка?

- Не нужно перезапускать сервис при добавлении ключа.
- Polling mtime файла — простой и надёжный механизм.
- Альтернатива: SIGUSR1 сигнал (не реализовано в MVP).

## Обработка ошибок

| HTTP код | Действие | Cooldown |
|---|---|---|
| 429 | Переключение на следующий профиль | 1мин → 5мин → 25мин → 1ч |
| 401 | Пометить ключ как невалидный | 5ч → 10ч → 20ч → 24ч |
| 403 | Пометить как permanent auth error | 5ч → 10ч → 20ч → 24ч |
| 5xx | Retry с backoff, затем переключение | 1мин → 5мин → 25мин → 1ч |

## Ограничения и known issues (MVP)

- ❌ Не реализуем автоматическую регистрацию у провайдеров
- ❌ Не реализуем UI (только API)
- ❌ Не реализуем биллинг и учёт расходов
- ❌ Не реализуем кэширование ответов
- ❌ Не гарантируем стабильность структуры data.json каталога
- ⚠️ Google Gemini API не полностью OpenAI-совместим — может потребоваться адаптер
- ⚠️ Cloudflare Workers AI использует нестандартный URL format (с account_id)
- ⚠️ Некоторые провайдеры могут логировать промпты для обучения моделей

## Структура проекта

```
/src
  /sync/synchronizer.ts    — Синхронизатор (каталог + keys → pool-config)
  /app/runtime.ts          — Рантайм (HTTP-сервис с failover)
  /shared/types.ts         — Общие типы
  /shared/config.ts        — Конфигурация из env vars
  /shared/logger.ts        — Структурированный JSON-логгер
  /App.tsx                 — React-дашборд (документация + мониторинг)
/tests
  /sync.test.ts            — Тесты синхронизатора
  /tests/runtime.test.ts   — Тесты рантайма + интеграционные
.env.example               — Шаблон переменных окружения
.gitignore                 — Исключения (ключи, конфиги)
keys.json.example          — Пример файла ключей
pool-config.json.example   — Пример pool-config
README.md                  — Документация
```

## Скрипты

```bash
npm run sync     # Запустить синхронизатор
npm start        # Запустить рантайм (HTTP-сервис)
npm test         # Запустить тесты
npm run lint     # Проверить типы
npm run dev      # Запустить React-дашборд (разработка)
npm run build    # Собрать дашборд
```

## Безопасность

- API-ключи **никогда** не хардкодятся в исходниках
- `keys.json`, `pool-config.json`, `llm-pool-state.json` в `.gitignore`
- В логах ключи маскируются: `gsk_...abcd`
- Синхронизатор не логирует содержимое keys.json

## Лицензия

MIT
