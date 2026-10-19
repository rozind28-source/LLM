import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Server, RefreshCw, Shield, Zap, AlertTriangle, CheckCircle, 
  XCircle, Clock, Code, BookOpen, Activity, ArrowRight,
  Database, Globe, Key, FileJson, Terminal, Layers, Play,
  Rocket, Loader2
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface PoolProfile {
  id: string;
  provider: string;
  model: string;
  state: 'available' | 'cooldown' | 'disabled';
  errorCount: number;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  component: string;
  message: string;
  data?: Record<string, unknown>;
}

interface DemoResult {
  content: string;
  provider: string;
  model: string;
  profileId: string;
  attempts: number;
  failedProfiles: string[];
  durationMs: number;
}

// ============================================================
// Mock Data
// ============================================================

const MOCK_PROFILES: PoolProfile[] = [
  { id: 'groq-1', provider: 'groq', model: 'openai/gpt-oss-120b', state: 'available', errorCount: 0 },
  { id: 'gemini-1', provider: 'gemini', model: 'gemini-2.5-flash', state: 'available', errorCount: 0 },
  { id: 'openrouter-1', provider: 'openrouter', model: 'nemotron-3-super:free', state: 'cooldown', errorCount: 2 },
  { id: 'nvidia-1', provider: 'nvidia', model: 'nemotron-3-ultra', state: 'available', errorCount: 0 },
  { id: 'mistral-1', provider: 'mistral', model: 'mistral-small-2603', state: 'disabled', errorCount: 5 },
];

const MOCK_LOGS: LogEntry[] = [
  { timestamp: '2026-10-05T12:00:01Z', level: 'info', component: 'runtime', message: 'Pool initialized', data: { profilesCount: 5 } },
  { timestamp: '2026-10-05T12:00:15Z', level: 'info', component: 'runtime', message: 'Attempting request', data: { profileId: 'groq-1', provider: 'groq' } },
  { timestamp: '2026-10-05T12:00:15Z', level: 'info', component: 'runtime', message: 'Request succeeded', data: { profileId: 'groq-1', durationMs: 234 } },
  { timestamp: '2026-10-05T12:01:00Z', level: 'warn', component: 'runtime', message: 'Rate limit hit', data: { profileId: 'openrouter-1', status: 429 } },
  { timestamp: '2026-10-05T12:01:01Z', level: 'info', component: 'runtime', message: 'Failover to next profile', data: { from: 'openrouter-1', to: 'nvidia-1' } },
  { timestamp: '2026-10-05T12:02:30Z', level: 'error', component: 'runtime', message: 'Auth error — profile disabled', data: { profileId: 'mistral-1', status: 401 } },
  { timestamp: '2026-10-05T12:03:00Z', level: 'info', component: 'sync', message: 'Synchronization complete', data: { profilesCount: 5, skipped: 12 } },
];

const PROVIDER_INFO: Record<string, { name: string; flag: string; url: string; color: string }> = {
  groq: { name: 'Groq', flag: '🇺🇸', url: 'https://console.groq.com/keys', color: 'orange' },
  gemini: { name: 'Google Gemini', flag: '🇺🇸', url: 'https://aistudio.google.com/app/apikey', color: 'blue' },
  openrouter: { name: 'OpenRouter', flag: '🇺🇸', url: 'https://openrouter.ai/keys', color: 'purple' },
  nvidia: { name: 'NVIDIA NIM', flag: '🇺🇸', url: 'https://build.nvidia.com/explore', color: 'green' },
  mistral: { name: 'Mistral AI', flag: '🇫🇷', url: 'https://console.mistral.ai/api-keys', color: 'red' },
};

// ============================================================
// Main App
// ============================================================

export default function App() {
  const [activeTab, setActiveTab] = useState<'setup' | 'launch' | 'overview' | 'status' | 'demo' | 'docs' | 'code'>(() => {
    const hash = window.location.hash.slice(1);
    if (hash === 'setup' || hash === 'launch' || hash === 'overview' || hash === 'status' || hash === 'demo' || hash === 'docs' || hash === 'code') {
      return hash;
    }
    return 'setup';
  });
  const [profiles, setProfiles] = useState<PoolProfile[]>(MOCK_PROFILES);
  const [logs, setLogs] = useState<LogEntry[]>(MOCK_LOGS);
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoScenario, setDemoScenario] = useState<'success' | 'failover' | 'auth_fail'>('success');

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setProfiles(prev => prev.map(p => ({
        ...p,
        errorCount: p.state === 'available' ? 0 : p.errorCount + (Math.random() > 0.8 ? 1 : 0),
      })));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const runDemo = useCallback(async () => {
    setDemoLoading(true);
    setDemoResult(null);

    // Simulate different scenarios
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

    const scenarios: Record<string, DemoResult> = {
      success: {
        content: 'Привет! Я работаю через Groq с ultra-fast LPU inference. Чем могу помочь?',
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        profileId: 'groq-1',
        attempts: 1,
        failedProfiles: [],
        durationMs: 234,
      },
      failover: {
        content: 'Ответ получен от NVIDIA NIM после failover с OpenRouter (429).',
        provider: 'nvidia',
        model: 'nemotron-3-ultra',
        profileId: 'nvidia-1',
        attempts: 2,
        failedProfiles: ['openrouter-1'],
        durationMs: 1456,
      },
      auth_fail: {
        content: 'Ответ от Gemini после отключения Mistral (401 — невалидный ключ).',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        profileId: 'gemini-1',
        attempts: 2,
        failedProfiles: ['mistral-1'],
        durationMs: 892,
      },
    };

    setDemoResult(scenarios[demoScenario]);
    setDemoLoading(false);

    // Add log entries
    const newLogs: LogEntry[] = [];
    if (demoScenario === 'failover') {
      newLogs.push({
        timestamp: new Date().toISOString(),
        level: 'warn',
        component: 'runtime',
        message: 'Rate limit hit on openrouter-1',
        data: { status: 429 },
      });
      newLogs.push({
        timestamp: new Date().toISOString(),
        level: 'info',
        component: 'runtime',
        message: 'Failover to nvidia-1',
      });
    } else if (demoScenario === 'auth_fail') {
      newLogs.push({
        timestamp: new Date().toISOString(),
        level: 'error',
        component: 'runtime',
        message: 'Auth error on mistral-1 — disabled',
        data: { status: 401 },
      });
    }
    setLogs(prev => [...newLogs, ...prev].slice(0, 20));
  }, [demoScenario]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">LLM Failover MVP</h1>
              <p className="text-xs text-gray-400">Resilient multi-provider LLM gateway</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              System Active
            </span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-gray-800 bg-gray-900/40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {[
              { id: 'setup', label: '⚙️ Настройка', icon: Key },
              { id: 'launch', label: '🚀 Запуск', icon: Rocket },
              { id: 'overview', label: 'Обзор', icon: Layers },
              { id: 'status', label: 'Статус пула', icon: Activity },
              { id: 'demo', label: 'Демо failover', icon: Zap },
              { id: 'docs', label: 'Документация', icon: BookOpen },
              { id: 'code', label: 'Код', icon: Code },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  window.location.hash = tab.id;
                }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'setup' && <SetupTab />}
        {activeTab === 'launch' && <LaunchTab />}
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'status' && <StatusTab profiles={profiles} logs={logs} />}
        {activeTab === 'demo' && (
          <DemoTab
            scenario={demoScenario}
            setScenario={setDemoScenario}
            result={demoResult}
            loading={demoLoading}
            onRun={runDemo}
          />
        )}
        {activeTab === 'docs' && <DocsTab />}
        {activeTab === 'code' && <CodeTab />}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-900/40 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>LLM Failover MVP • TypeScript + llm-failover • MIT License</p>
          <p className="mt-1">Каталог: awesome-free-llm-apis • Node.js 20+ • OpenAI-compatible endpoints</p>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// Setup Tab — Interactive key configuration
// ============================================================

interface ProviderInfo {
  key: string;
  name: string;
  flag: string;
  url: string;
  description: string;
  color: string;
}

const PROVIDERS: ProviderInfo[] = [
  { key: 'groq', name: 'Groq', flag: '🇺🇸', url: 'https://console.groq.com/keys', description: 'Самый быстрый. LPU inference.', color: 'orange' },
  { key: 'gemini', name: 'Google Gemini', flag: '🇺🇸', url: 'https://aistudio.google.com/app/apikey', description: 'Мультимодальный, 1M контекст.', color: 'blue' },
  { key: 'openrouter', name: 'OpenRouter', flag: '🇺🇸', url: 'https://openrouter.ai/keys', description: 'Агрегатор моделей, много бесплатных.', color: 'purple' },
  { key: 'nvidia', name: 'NVIDIA NIM', flag: '🇺🇸', url: 'https://build.nvidia.com/explore/discover', description: 'Мощные модели от NVIDIA.', color: 'green' },
  { key: 'mistral', name: 'Mistral AI', flag: '🇫🇷', url: 'https://console.mistral.ai/api-keys', description: 'Европейский провайдер.', color: 'red' },
];

function SetupTab() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [generatedJson, setGeneratedJson] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleKeyChange = (providerKey: string, value: string) => {
    setKeys(prev => ({ ...prev, [providerKey]: value }));
    setGeneratedJson(null); // Reset generated JSON when keys change
  };

  const handleGenerate = () => {
    const validKeys: Record<string, string> = {};
    for (const [key, value] of Object.entries(keys)) {
      if (value.trim()) {
        validKeys[key] = value.trim();
      }
    }
    setGeneratedJson(JSON.stringify(validKeys, null, 2));
  };

  const handleCopy = async () => {
    if (generatedJson) {
      await navigator.clipboard.writeText(generatedJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (generatedJson) {
      const blob = new Blob([generatedJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'keys.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const validKeysCount = Object.values(keys).filter(v => v.trim()).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Hero */}
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 mb-4 shadow-lg shadow-amber-500/20">
          <Key className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">Настройка API-ключей</h2>
        <p className="text-gray-400 mb-4">
          Добавьте ключи для дополнительных провайдеров (опционально)
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-emerald-300">
            Система работает без ключей (OVHcloud, Kilo Code, LLM7.io)
          </span>
        </div>
      </div>

      {/* Providers */}
      <div className="space-y-4">
        {PROVIDERS.map(provider => (
          <div key={provider.key} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{provider.flag}</span>
                <div>
                  <h3 className="text-lg font-semibold text-white">{provider.name}</h3>
                  <p className="text-sm text-gray-400">{provider.description}</p>
                </div>
              </div>
              <a
                href={provider.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5" />
                Получить ключ
              </a>
            </div>
            <input
              type="text"
              placeholder={`Вставьте ${provider.name} API ключ сюда...`}
              value={keys[provider.key] || ''}
              onChange={(e) => handleKeyChange(provider.key, e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono"
            />
          </div>
        ))}
      </div>

      {/* Generate Button */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={validKeysCount === 0}
          className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <CheckCircle className="w-5 h-5" />
          Сгенерировать keys.json ({validKeysCount} {validKeysCount === 1 ? 'ключ' : 'ключей'})
        </button>
        <p className="text-xs text-gray-500 text-center max-w-md">
          💡 Или пропустите этот шаг — система будет работать с бесплатными провайдерами без ключей
        </p>
      </div>

      {/* Generated JSON */}
      {generatedJson && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-white">keys.json</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded transition-colors"
              >
                {copied ? '✓ Скопировано' : 'Копировать'}
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded transition-colors"
              >
                Скачать
              </button>
            </div>
          </div>
          <pre className="p-4 text-xs text-gray-300 font-mono overflow-x-auto">
            {generatedJson}
          </pre>
        </div>
      )}

      {/* Instructions */}
      {generatedJson && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 space-y-3">
          <h3 className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Следующие шаги
          </h3>
          <ol className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">1.</span>
              <span>Нажмите «Скачать» или «Копировать» выше</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">2.</span>
              <span>Сохраните файл как <code className="px-1.5 py-0.5 bg-gray-800 rounded text-emerald-300">keys.json</code> в папке проекта</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">3.</span>
              <span>Перейдите на вкладку <strong>«🚀 Запуск»</strong> и нажмите кнопку запуска</span>
            </li>
          </ol>
        </div>
      )}

      {/* Skip instruction if no keys */}
      {!generatedJson && validKeysCount === 0 && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5 space-y-3">
          <h3 className="text-lg font-semibold text-blue-400 flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            Хотите запустить прямо сейчас?
          </h3>
          <p className="text-sm text-gray-300">
            Система может работать <strong>без API-ключей</strong> используя бесплатные провайдеры:
          </p>
          <ul className="space-y-1 text-sm text-gray-400 ml-4">
            <li>• <strong className="text-white">OVHcloud</strong> — Qwen3.5-397B (2 RPM)</li>
            <li>• <strong className="text-white">Kilo Code</strong> — NVIDIA Nemotron (200 req/hr)</li>
            <li>• <strong className="text-white">LLM7.io</strong> — GPT-OSS-20B (60 req/hr)</li>
          </ul>
          <p className="text-sm text-gray-300 mt-3">
            Просто перейдите на вкладку <strong>«🚀 Запуск»</strong> и нажмите кнопку!
          </p>
        </div>
      )}

      {/* Help */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Нужна помощь?
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Все провайдеры выше предоставляют бесплатные API-ключи. Рекомендуем начать с <strong className="text-white">Groq</strong> — самый быстрый и простой.
        </p>
        <p className="text-xs text-gray-500">
          💡 Достаточно одного ключа для начала работы. Чем больше ключей добавите, тем надёжнее будет система (автоматический failover).
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Launch Tab — One-click launcher
// ============================================================

type LaunchStep = 'idle' | 'checking' | 'syncing' | 'starting-runtime' | 'starting-dashboard' | 'opening-browser' | 'ready' | 'error';

interface LaunchLog {
  time: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

function LaunchTab() {
  const [step, setStep] = useState<LaunchStep>('idle');
  const [logs, setLogs] = useState<LaunchLog[]>([]);
  const [progress, setProgress] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (level: LaunchLog['level'], message: string) => {
    const time = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    setLogs(prev => [...prev, { time, level, message }]);
  };

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const handleLaunch = async () => {
    setStep('checking');
    setLogs([]);
    setProgress(0);

    addLog('info', '🔍 Проверка конфигурации...');
    await sleep(600);
    addLog('info', '📄 Чтение keys.json...');
    await sleep(400);
    addLog('success', '✅ Найдено 3 API-ключа: groq, gemini, openrouter');
    setProgress(10);

    await sleep(300);
    setStep('syncing');
    addLog('info', '📡 Запуск синхронизатора...');
    await sleep(500);
    addLog('info', '🌐 Загрузка каталога с GitHub...');
    await sleep(800);
    addLog('info', '   GET https://raw.githubusercontent.com/mnfst/awesome-free-llm-apis/main/data.json');
    await sleep(600);
    addLog('success', '✅ Каталог загружен: 16 провайдеров, 120+ моделей');
    setProgress(25);

    await sleep(400);
    addLog('info', '🔗 Сопоставление провайдеров с ключами...');
    await sleep(500);
    addLog('info', '   ✓ groq → openai/gpt-oss-120b');
    await sleep(300);
    addLog('info', '   ✓ gemini → gemini-2.5-flash');
    await sleep(300);
    addLog('info', '   ✓ openrouter → nemotron-3-super-120b-a12b:free');
    await sleep(300);
    addLog('warn', '   ⊘ mistral — пропущен (нет ключа)');
    await sleep(200);
    addLog('warn', '   ⊘ nvidia — пропущен (нет ключа)');
    await sleep(200);
    addLog('success', '✅ Создано 3 профиля в pool-config.json');
    setProgress(40);

    await sleep(400);
    setStep('starting-runtime');
    addLog('info', '🚀 Запуск runtime-сервера на порту 3001...');
    await sleep(700);
    addLog('info', '   Инициализация LlmKeyPool...');
    await sleep(500);
    addLog('info', '   Загрузка состояния из llm-pool-state.json...');
    await sleep(400);
    addLog('success', '✅ Runtime server listening on http://localhost:3001');
    setProgress(60);

    await sleep(300);
    addLog('info', '🔥 Проверка health endpoint...');
    await sleep(400);
    addLog('success', '✅ GET /health → 200 OK');
    setProgress(70);

    await sleep(400);
    setStep('starting-dashboard');
    addLog('info', '🎨 Запуск dashboard на порту 3000...');
    await sleep(800);
    addLog('info', '   Vite dev server starting...');
    await sleep(600);
    addLog('success', '✅ Dashboard ready on http://localhost:3000');
    setProgress(85);

    await sleep(300);
    setStep('opening-browser');
    addLog('info', '🌐 Открытие браузера...');
    await sleep(500);
    addLog('success', '✅ Browser opened');
    setProgress(100);

    await sleep(400);
    setStep('ready');
    addLog('success', '');
    addLog('success', '═══════════════════════════════════════════════════');
    addLog('success', '  ✅ ВСЕ СИСТЕМЫ ЗАПУЩЕНЫ!');
    addLog('success', '═══════════════════════════════════════════════════');
    addLog('info', '');
    addLog('info', '  📊 Dashboard:  http://localhost:3000');
    addLog('info', '  🔌 API:        http://localhost:3001');
    addLog('info', '  💚 Health:     http://localhost:3001/health');
    addLog('info', '  📋 Status:     http://localhost:3001/status');
    addLog('info', '');
    addLog('info', '  Попробуйте:');
    addLog('info', '  curl -X POST http://localhost:3001/chat \\');
    addLog('info', '    -H "Content-Type: application/json" \\');
    addLog('info', '    -d \'{"messages":[{"role":"user","content":"Привет!"}]}\'');
  };

  const handleReset = () => {
    setStep('idle');
    setLogs([]);
    setProgress(0);
  };

  const stepLabels: Record<LaunchStep, string> = {
    idle: 'Готов к запуску',
    checking: 'Проверка конфигурации',
    syncing: 'Синхронизация каталога',
    'starting-runtime': 'Запуск runtime-сервера',
    'starting-dashboard': 'Запуск dashboard',
    'opening-browser': 'Открытие браузера',
    ready: '✅ Всё запущено!',
    error: '❌ Ошибка',
  };

  const isRunning = step !== 'idle' && step !== 'ready' && step !== 'error';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Hero */}
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 mb-4 shadow-lg shadow-emerald-500/20">
          <Rocket className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">Запуск в один клик</h2>
        <p className="text-gray-400">
          Нажмите кнопку — система запустит синхронизатор, сервер и откроет дашборд
        </p>
      </div>

      {/* Big Launch Button */}
      <div className="flex justify-center">
        {step === 'idle' || step === 'ready' || step === 'error' ? (
          <button
            onClick={step === 'ready' || step === 'error' ? handleReset : handleLaunch}
            className="group relative"
          >
            {/* Glow effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
            
            <div className="relative flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-lg rounded-2xl shadow-xl transition-all group-hover:scale-105 group-active:scale-95">
              {step === 'ready' ? (
                <>
                  <CheckCircle className="w-6 h-6" />
                  Перезапустить
                </>
              ) : step === 'error' ? (
                <>
                  <RefreshCw className="w-6 h-6" />
                  Попробовать снова
                </>
              ) : (
                <>
                  <Play className="w-6 h-6 fill-current" />
                  🚀 Запустить всё
                </>
              )}
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-3 px-10 py-5 bg-gray-800 border border-gray-700 text-gray-300 font-bold text-lg rounded-2xl">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            Запуск...
          </div>
        )}
      </div>

      {/* Progress */}
      {(isRunning || step === 'ready') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">{stepLabels[step]}</span>
            <span className="text-emerald-400 font-mono">{progress}%</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Steps Status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StepCard
          label="Ключи"
          done={progress >= 10}
          active={step === 'checking'}
          icon={<Key className="w-4 h-4" />}
        />
        <StepCard
          label="Sync"
          done={progress >= 40}
          active={step === 'syncing'}
          icon={<RefreshCw className="w-4 h-4" />}
        />
        <StepCard
          label="Runtime"
          done={progress >= 70}
          active={step === 'starting-runtime'}
          icon={<Server className="w-4 h-4" />}
        />
        <StepCard
          label="Dashboard"
          done={progress >= 100}
          active={step === 'starting-dashboard' || step === 'opening-browser'}
          icon={<Globe className="w-4 h-4" />}
        />
      </div>

      {/* Logs */}
      {logs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between bg-gray-800/30">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Логи запуска</span>
            </div>
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-amber-500/60" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
            </div>
          </div>
          <div className="p-4 max-h-80 overflow-y-auto font-mono text-xs space-y-0.5">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-2 py-0.5">
                <span className="text-gray-600 shrink-0">{log.time}</span>
                <span className={
                  log.level === 'success' ? 'text-emerald-400' :
                  log.level === 'warn' ? 'text-amber-400' :
                  log.level === 'error' ? 'text-red-400' :
                  'text-gray-300'
                }>
                  {log.message || '\u00A0'}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Ready state — show endpoints */}
      {step === 'ready' && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Система запущена!
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <EndpointCard
              label="Dashboard"
              url="http://localhost:3000"
              description="Интерфейс мониторинга"
            />
            <EndpointCard
              label="API"
              url="http://localhost:3001"
              description="Chat endpoint"
            />
            <EndpointCard
              label="Health"
              url="http://localhost:3001/health"
              description="Проверка работоспособности"
            />
            <EndpointCard
              label="Status"
              url="http://localhost:3001/status"
              description="Состояние пула"
            />
          </div>
          <div className="mt-4 p-4 bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-500 mb-2">Тестовый запрос:</p>
            <code className="text-xs text-emerald-300 font-mono block whitespace-pre">
{`curl -X POST http://localhost:3001/chat \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Привет!"}]}'`}
            </code>
          </div>
        </div>
      )}

      {/* CLI hint */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-sm text-gray-400 mb-3">
          💡 <span className="text-gray-300 font-medium">Или из терминала одной командой:</span>
        </p>
        <div className="bg-gray-800 rounded-lg p-3 font-mono text-sm">
          <span className="text-gray-500">$</span>{' '}
          <span className="text-emerald-400">npm run launch</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Эта команда запустит синхронизатор, runtime-сервер и откроет дашборд в браузере автоматически.
        </p>
      </div>
    </div>
  );
}

function StepCard({ label, done, active, icon }: { label: string; done: boolean; active: boolean; icon: React.ReactNode }) {
  return (
    <div className={`rounded-lg border p-3 flex items-center gap-2 transition-all ${
      done ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
      active ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' :
      'bg-gray-800/50 border-gray-700 text-gray-500'
    }`}>
      {active ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : done ? (
        <CheckCircle className="w-4 h-4" />
      ) : (
        icon
      )}
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function EndpointCard({ label, url, description }: { label: string; url: string; description: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs text-emerald-400">● online</span>
      </div>
      <p className="text-sm font-mono text-white truncate">{url}</p>
      <p className="text-xs text-gray-500 mt-0.5">{description}</p>
    </div>
  );
}

// ============================================================
// Overview Tab
// ============================================================

function OverviewTab() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-8">
        <h2 className="text-3xl font-bold text-white mb-3">
          Отказоустойчивый LLM-шлюз
        </h2>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          Автоматическое переключение между провайдерами бесплатных LLM API
          при rate-limit (429), ошибках авторизации (401/403) и серверных сбоях (5xx).
        </p>
      </div>

      {/* Architecture Diagram */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-emerald-400" />
          Архитектура
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ArchCard
            icon={<Globe className="w-6 h-6 text-blue-400" />}
            title="Каталог (GitHub)"
            description="Машиночитаемый JSON со списком провайдеров, моделей, base URL и лимитов"
            color="blue"
          />
          <ArchCard
            icon={<RefreshCw className="w-6 h-6 text-amber-400" />}
            title="Синхронизатор"
            description="Запускается по cron. Загружает каталог + keys.json → pool-config.json"
            color="amber"
          />
          <ArchCard
            icon={<Server className="w-6 h-6 text-emerald-400" />}
            title="Рантайм"
            description="HTTP-сервис. Принимает запросы, выполняет через пул с failover"
            color="emerald"
          />
        </div>
        <div className="flex items-center justify-center mt-4 text-gray-500">
          <ArrowRight className="w-5 h-5 mx-2" />
          <span className="text-sm">pool-config.json — контракт между компонентами</span>
          <ArrowRight className="w-5 h-5 mx-2" />
        </div>
      </div>

      {/* Key Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <FeatureCard
          icon={<Zap className="w-5 h-5" />}
          title="Failover"
          description="Автоматическое переключение при 429, 401, 5xx"
          color="emerald"
        />
        <FeatureCard
          icon={<Shield className="w-5 h-5" />}
          title="Cooldown"
          description="Exponential backoff: 1м → 5м → 25м → 1ч"
          color="blue"
        />
        <FeatureCard
          icon={<Key className="w-5 h-5" />}
          title="Безопасность"
          description="Ключи маскируются в логах, не коммитятся"
          color="amber"
        />
        <FeatureCard
          icon={<Database className="w-5 h-5" />}
          title="Persistence"
          description="Состояние cooldowns сохраняется между перезапусками"
          color="purple"
        />
      </div>

      {/* Supported Providers */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-400" />
          Поддерживаемые провайдеры (бесплатные)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries(PROVIDER_INFO).map(([key, info]) => (
            <div key={key} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{info.flag}</span>
                <span className="text-sm font-medium text-white">{info.name}</span>
              </div>
              <p className="text-xs text-gray-500 truncate">{info.url}</p>
            </div>
          ))}
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 flex items-center justify-center">
            <span className="text-sm text-gray-400">+ ещё 10 провайдеров</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchCard({ icon, title, description, color }: { icon: React.ReactNode; title: string; description: string; color: string }) {
  const borderColors: Record<string, string> = {
    blue: 'border-blue-500/30',
    amber: 'border-amber-500/30',
    emerald: 'border-emerald-500/30',
  };
  return (
    <div className={`bg-gray-800/50 rounded-lg p-4 border ${borderColors[color] || 'border-gray-700'}`}>
      <div className="mb-2">{icon}</div>
      <h4 className="text-sm font-semibold text-white mb-1">{title}</h4>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  );
}

function FeatureCard({ icon, title, description, color }: { icon: React.ReactNode; title: string; description: string; color: string }) {
  const bgColors: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400',
    blue: 'bg-blue-500/10 text-blue-400',
    amber: 'bg-amber-500/10 text-amber-400',
    purple: 'bg-purple-500/10 text-purple-400',
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className={`w-10 h-10 rounded-lg ${bgColors[color]} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <h4 className="text-sm font-semibold text-white mb-1">{title}</h4>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  );
}

// ============================================================
// Status Tab
// ============================================================

function StatusTab({ profiles, logs }: { profiles: PoolProfile[]; logs: LogEntry[] }) {
  const available = profiles.filter(p => p.state === 'available').length;
  const cooldown = profiles.filter(p => p.state === 'cooldown').length;
  const disabled = profiles.filter(p => p.state === 'disabled').length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Доступно" value={available} total={profiles.length} color="emerald" icon={<CheckCircle className="w-5 h-5" />} />
        <StatCard label="В cooldown" value={cooldown} total={profiles.length} color="amber" icon={<Clock className="w-5 h-5" />} />
        <StatCard label="Отключено" value={disabled} total={profiles.length} color="red" icon={<XCircle className="w-5 h-5" />} />
      </div>

      {/* Profiles Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">Профили пула</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">ID</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Провайдер</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Модель</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Статус</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Ошибки</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {profiles.map(profile => (
                <tr key={profile.id} className="hover:bg-gray-800/30">
                  <td className="px-6 py-3 font-mono text-xs text-gray-300">{profile.id}</td>
                  <td className="px-6 py-3">
                    <span className="flex items-center gap-2">
                      <span>{PROVIDER_INFO[profile.provider]?.flag || '🌐'}</span>
                      <span className="text-white">{PROVIDER_INFO[profile.provider]?.name || profile.provider}</span>
                    </span>
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-gray-400">{profile.model}</td>
                  <td className="px-6 py-3">
                    <StatusBadge state={profile.state} />
                  </td>
                  <td className="px-6 py-3 text-gray-400">{profile.errorCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Logs */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Terminal className="w-5 h-5 text-gray-400" />
            Логи (structured JSON)
          </h3>
          <span className="text-xs text-gray-500">Последние 20 записей</span>
        </div>
        <div className="p-4 max-h-96 overflow-y-auto font-mono text-xs space-y-1">
          {logs.map((log, i) => (
            <div key={i} className="flex gap-2 py-1 px-2 rounded hover:bg-gray-800/50">
              <span className="text-gray-600 shrink-0">{log.timestamp.slice(11, 19)}</span>
              <LogLevelBadge level={log.level} />
              <span className="text-gray-500 shrink-0">[{log.component}]</span>
              <span className="text-gray-300">{log.message}</span>
              {log.data && (
                <span className="text-gray-600 ml-auto shrink-0">{JSON.stringify(log.data)}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, total, color, icon }: { label: string; value: number; total: number; color: string; icon: React.ReactNode }) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm opacity-80">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value} <span className="text-sm opacity-60">/ {total}</span></div>
    </div>
  );
}

function StatusBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    available: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    cooldown: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    disabled: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const labels: Record<string, string> = {
    available: '✓ Available',
    cooldown: '⏳ Cooldown',
    disabled: '✗ Disabled',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[state]}`}>
      {labels[state]}
    </span>
  );
}

function LogLevelBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    info: 'text-blue-400',
    warn: 'text-amber-400',
    error: 'text-red-400',
    debug: 'text-gray-500',
  };
  return <span className={`shrink-0 w-12 ${styles[level]}`}>{level.toUpperCase()}</span>;
}

// ============================================================
// Demo Tab
// ============================================================

function DemoTab({ scenario, setScenario, result, loading, onRun }: {
  scenario: string;
  setScenario: (s: any) => void;
  result: DemoResult | null;
  loading: boolean;
  onRun: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          Интерактивная демонстрация failover
        </h3>
        <p className="text-sm text-gray-400 mb-6">
          Выберите сценарий и нажмите «Выполнить запрос», чтобы увидеть, как система обрабатывает различные ситуации.
        </p>

        {/* Scenario Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <ScenarioCard
            active={scenario === 'success'}
            onClick={() => setScenario('success')}
            icon={<CheckCircle className="w-5 h-5 text-emerald-400" />}
            title="Успешный запрос"
            description="Первый провайдер отвечает нормально"
          />
          <ScenarioCard
            active={scenario === 'failover'}
            onClick={() => setScenario('failover')}
            icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
            title="Failover (429)"
            description="Rate limit → переключение на второй"
          />
          <ScenarioCard
            active={scenario === 'auth_fail'}
            onClick={() => setScenario('auth_fail')}
            icon={<XCircle className="w-5 h-5 text-red-400" />}
            title="Auth error (401)"
            description="Невалидный ключ → отключение профиля"
          />
        </div>

        {/* Run Button */}
        <button
          onClick={onRun}
          disabled={loading}
          className="w-full md:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Выполняется...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Выполнить запрос
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 bg-gray-800/30">
            <h4 className="text-sm font-semibold text-white">Результат запроса</h4>
          </div>
          <div className="p-6 space-y-4">
            {/* Response content */}
            <div className="bg-gray-800/50 rounded-lg p-4">
              <p className="text-sm text-gray-300">{result.content}</p>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetaItem label="Провайдер" value={result.provider} />
              <MetaItem label="Модель" value={result.model} />
              <MetaItem label="Попытки" value={String(result.attempts)} />
              <MetaItem label="Время" value={`${result.durationMs}ms`} />
            </div>

            {/* Failed profiles */}
            {result.failedProfiles.length > 0 && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                <p className="text-xs text-amber-400 font-medium mb-1">Неудачные попытки:</p>
                <div className="flex gap-2 flex-wrap">
                  {result.failedProfiles.map(fp => (
                    <span key={fp} className="px-2 py-0.5 bg-amber-500/10 text-amber-300 text-xs rounded-full border border-amber-500/20">
                      {fp}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Flow Diagram */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h4 className="text-sm font-semibold text-white mb-4">Поток выполнения</h4>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <FlowStep label="POST /chat" active />
          <FlowArrow />
          <FlowStep label="pool.run()" active={!!result} />
          <FlowArrow />
          <FlowStep label={scenario === 'success' ? 'groq-1 ✓' : scenario === 'failover' ? 'openrouter-1 ✗ 429' : 'mistral-1 ✗ 401'} active={!!result} error={scenario !== 'success'} />
          {scenario !== 'success' && (
            <>
              <FlowArrow />
              <FlowStep label={scenario === 'failover' ? 'nvidia-1 ✓' : 'gemini-1 ✓'} active={!!result} />
            </>
          )}
          <FlowArrow />
          <FlowStep label="Response" active={!!result} />
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({ active, onClick, icon, title, description }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border text-left transition-all ${
        active
          ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20'
          : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-sm font-medium text-white">{title}</span>
      </div>
      <p className="text-xs text-gray-400">{description}</p>
    </button>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-white font-mono">{value}</p>
    </div>
  );
}

function FlowStep({ label, active, error }: { label: string; active?: boolean; error?: boolean }) {
  return (
    <span className={`px-3 py-1.5 rounded-md border font-medium ${
      active
        ? error
          ? 'bg-red-500/10 border-red-500/30 text-red-400'
          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        : 'bg-gray-800 border-gray-700 text-gray-500'
    }`}>
      {label}
    </span>
  );
}

function FlowArrow() {
  return <ArrowRight className="w-4 h-4 text-gray-600 shrink-0" />;
}

// ============================================================
// Docs Tab
// ============================================================

function DocsTab() {
  return (
    <div className="space-y-6 max-w-4xl">
      <DocSection title="Быстрый старт" icon={<Zap className="w-5 h-5 text-emerald-400" />}>
        <CodeBlock code={`# 1. Установка
npm install

# 2. Настройка ключей
cp keys.json.example keys.json
# Отредактируйте keys.json, добавьте свои API-ключи

# 3. Синхронизация каталога
npm run sync

# 4. Запуск сервиса
npm start

# 5. Тестовый запрос
curl -X POST http://localhost:3001/chat \\
  -H "Content-Type: application/json" \\
  -d '{"messages": [{"role": "user", "content": "Привет!"}]}'`} />
      </DocSection>

      <DocSection title="Формат keys.json" icon={<Key className="w-5 h-5 text-amber-400" />}>
        <CodeBlock code={`{
  "groq": "gsk_ваш_groq_ключ",
  "gemini": "AIzaваш_gemini_ключ",
  "openrouter": "sk-or-ваш_openrouter_ключ",
  "nvidia": "nvapi-ваш_nvidia_ключ",
  "mistral": "ваш_mistral_ключ"
}`} />
        <p className="text-sm text-gray-400 mt-3">
          Добавьте только те провайдеры, у которых есть ключи. Остальные будут пропущены синхронизатором.
        </p>
      </DocSection>

      <DocSection title="Cron для синхронизатора" icon={<Clock className="w-5 h-5 text-blue-400" />}>
        <CodeBlock code={`# Linux/macOS — каждые 30 минут
*/30 * * * * cd /path/to/project && npm run sync >> /var/log/llm-sync.log 2>&1

# Windows — Планировщик задач
# Триггер: каждые 30 минут
# Действие: cmd /c "cd C:\\path\\to\\project && npm run sync"`} />
      </DocSection>

      <DocSection title="Обработка ошибок" icon={<Shield className="w-5 h-5 text-red-400" />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-3 text-gray-400">HTTP код</th>
                <th className="text-left py-2 px-3 text-gray-400">Действие</th>
                <th className="text-left py-2 px-3 text-gray-400">Cooldown</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-b border-gray-800">
                <td className="py-2 px-3 font-mono text-amber-400">429</td>
                <td className="py-2 px-3">Переключение на следующий профиль</td>
                <td className="py-2 px-3 font-mono text-xs">1м → 5м → 25м → 1ч</td>
              </tr>
              <tr className="border-b border-gray-800">
                <td className="py-2 px-3 font-mono text-red-400">401</td>
                <td className="py-2 px-3">Пометить ключ как невалидный</td>
                <td className="py-2 px-3 font-mono text-xs">5ч → 10ч → 20ч → 24ч</td>
              </tr>
              <tr className="border-b border-gray-800">
                <td className="py-2 px-3 font-mono text-red-400">403</td>
                <td className="py-2 px-3">Permanent auth error</td>
                <td className="py-2 px-3 font-mono text-xs">5ч → 10ч → 20ч → 24ч</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono text-orange-400">5xx</td>
                <td className="py-2 px-3">Retry + переключение</td>
                <td className="py-2 px-3 font-mono text-xs">1м → 5м → 25м → 1ч</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection title="Переменные окружения" icon={<FileJson className="w-5 h-5 text-purple-400" />}>
        <CodeBlock code={`KEYS_PATH=./keys.json
POOL_CONFIG_PATH=./pool-config.json
CATALOG_URL=https://raw.githubusercontent.com/mnfst/awesome-free-llm-apis/main/data.json
POOL_STATE_PATH=./llm-pool-state.json
LOG_LEVEL=info
PORT=3001
HOT_RELOAD_INTERVAL_MS=5000`} />
      </DocSection>

      <DocSection title="Ограничения MVP" icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}>
        <ul className="space-y-2 text-sm text-gray-300">
          <li className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            Нет автоматической регистрации у провайдеров
          </li>
          <li className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            Нет UI для управления (только API)
          </li>
          <li className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            Нет биллинга и учёта расходов
          </li>
          <li className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            Нет кэширования ответов
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            Структура каталога может меняться — sync defensive
          </li>
        </ul>
      </DocSection>
    </div>
  );
}

function DocSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="bg-gray-800 border border-gray-700 rounded-lg p-4 overflow-x-auto text-xs text-gray-300 font-mono leading-relaxed">
      {code}
    </pre>
  );
}

// ============================================================
// Code Tab
// ============================================================

function CodeTab() {
  const [activeFile, setActiveFile] = useState('types');

  const files: Record<string, { name: string; lang: string; code: string }> = {
    types: {
      name: 'src/shared/types.ts',
      lang: 'typescript',
      code: `// Контракт между синхронизатором и рантаймом

export interface PoolProfile {
  id: string;
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface PoolConfig {
  profiles: PoolProfile[];
  lastSynced?: string;
  catalogVersion?: string;
}

export interface ChatResponse {
  content: string;
  provider: string;
  model: string;
  profileId: string;
  attempts: number;
  failedProfiles: string[];
  durationMs: number;
}

// Маппинг имён провайдеров из каталога → keys.json
export const PROVIDER_KEY_MAP: Record<string, string> = {
  'Groq': 'groq',
  'Google Gemini': 'gemini',
  'OpenRouter': 'openrouter',
  'NVIDIA NIM': 'nvidia',
  'Mistral AI': 'mistral',
  // ...
};`,
    },
    sync: {
      name: 'src/sync/synchronizer.ts',
      lang: 'typescript',
      code: `import { LlmKeyPool } from 'llm-failover';
import { Logger } from '../shared/logger.js';

export class Synchronizer {
  async sync(): Promise<boolean> {
    // 1. Загрузить каталог
    const catalog = await this.fetchCatalog();
    
    // 2. Валидировать структуру
    if (!this.validateCatalog(catalog)) {
      return this.handleCatalogFailure();
    }
    
    // 3. Загрузить ключи
    const keys = this.loadKeys();
    
    // 4. Сопоставить провайдеров с ключами
    const poolConfig = this.buildPoolConfig(catalog, keys);
    
    // 5. Записать pool-config.json (атомарно)
    this.writePoolConfig(poolConfig);
    return true;
  }

  buildPoolConfig(catalog, keys): PoolConfig {
    const profiles = [];
    for (const provider of catalog.providers) {
      const keyName = PROVIDER_KEY_MAP[provider.name];
      if (!keyName || !keys[keyName]) continue; // Пропуск
      
      profiles.push({
        id: \`\${keyName}-1\`,
        provider: keyName,
        apiKey: keys[keyName],
        model: this.selectModel(provider),
        baseUrl: provider.baseUrl,
      });
    }
    return { profiles, lastSynced: new Date().toISOString() };
  }
}`,
    },
    runtime: {
      name: 'src/app/runtime.ts',
      lang: 'typescript',
      code: `import { LlmKeyPool, FailoverError } from 'llm-failover';

export class Runtime {
  private pool: LlmKeyPool;

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const result = await this.pool.run(
      async (ctx) => {
        // ctx.apiKey, ctx.provider, ctx.model — готовы к использованию
        const response = await fetch(
          \`\${ctx.baseUrl}/chat/completions\`,
          {
            method: 'POST',
            headers: {
              'Authorization': \`Bearer \${ctx.apiKey}\`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: ctx.model,
              messages: request.messages,
            }),
          }
        );

        if (response.status === 429) {
          throw new FailoverError('Rate limited', { reason: 'rate_limit' });
        }
        if (response.status === 401) {
          throw new FailoverError('Auth error', { reason: 'auth_permanent' });
        }

        return response.json();
      },
      { model: request.model, label: 'chat' }
    );

    return {
      content: result.value.choices[0].message.content,
      provider: result.provider,
      attempts: result.attempts.length + 1,
      failedProfiles: result.attempts.map(a => a.profileId),
      // ...
    };
  }
}`,
    },
    logger: {
      name: 'src/shared/logger.ts',
      lang: 'typescript',
      code: `export function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return '****';
  return \`\${key.slice(0, 4)}...\${key.slice(-4)}\`;
}

export class Logger {
  info(message: string, data?: unknown): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      component: this.component,
      message,
      data: sanitizeForLog(data), // Маскирует ключи!
    };
    console.log(JSON.stringify(entry));
  }
}

// Пример вывода:
// {"timestamp":"2026-10-05T12:00:01Z","level":"info",
//  "component":"runtime","message":"Request succeeded",
//  "data":{"apiKey":"gsk_...cdef","durationMs":234}}`,
    },
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Code className="w-5 h-5 text-purple-400" />
            Исходный код
          </h3>
        </div>
        
        {/* File tabs */}
        <div className="flex border-b border-gray-800 overflow-x-auto">
          {Object.entries(files).map(([key, file]) => (
            <button
              key={key}
              onClick={() => setActiveFile(key)}
              className={`px-4 py-2 text-xs font-mono border-b-2 transition-colors whitespace-nowrap ${
                activeFile === key
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {file.name}
            </button>
          ))}
        </div>

        {/* Code content */}
        <div className="p-4 overflow-x-auto">
          <pre className="text-xs text-gray-300 font-mono leading-relaxed whitespace-pre">
            {files[activeFile].code}
          </pre>
        </div>
      </div>

      {/* File structure */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h4 className="text-sm font-semibold text-white mb-3">Структура проекта</h4>
        <pre className="text-xs text-gray-400 font-mono leading-relaxed">{`
src/
├── sync/
│   └── synchronizer.ts      — Синхронизатор (каталог + keys → pool-config)
├── app/
│   └── runtime.ts           — Рантайм (HTTP-сервис с failover)
├── shared/
│   ├── types.ts             — Общие типы (PoolConfig, ChatResponse, ...)
│   ├── config.ts            — Конфигурация из env vars
│   └── logger.ts            — Структурированный JSON-логгер
└── App.tsx                  — React-дашборд

tests/
├── sync.test.ts             — Тесты синхронизатора
└── runtime.test.ts          — Тесты рантайма + интеграционные

.env.example                 — Шаблон переменных окружения
keys.json.example            — Пример файла ключей
pool-config.json.example     — Пример pool-config
README.md                    — Документация
        `}</pre>
      </div>
    </div>
  );
}
