#!/usr/bin/env node
/**
 * Тестовый скрипт для проверки работы системы
 * Запуск: npx tsx scripts/test-api.ts
 */

async function testHealth() {
  console.log('\n🔍 Тест 1: Проверка работоспособности сервера...');
  try {
    const response = await fetch('http://localhost:3001/health');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Сервер работает:', data);
      return true;
    } else {
      console.log('❌ Сервер вернул ошибку:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Не удалось подключиться к серверу');
    console.log('   Убедитесь, что сервер запущен: npm run launch');
    return false;
  }
}

async function testStatus() {
  console.log('\n🔍 Тест 2: Проверка статуса пула...');
  try {
    const response = await fetch('http://localhost:3001/status');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Статус пула:');
      console.log('   - Всего профилей:', data.profiles?.length || 0);
      console.log('   - Доступно:', data.totalAvailable || 0);
      console.log('   - В cooldown:', data.totalInCooldown || 0);
      return true;
    } else {
      console.log('❌ Ошибка получения статуса:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Не удалось получить статус');
    return false;
  }
}

async function testChat() {
  console.log('\n🔍 Тест 3: Отправка тестового запроса к LLM...');
  try {
    const response = await fetch('http://localhost:3001/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: 'Скажи "Привет" одним словом',
          },
        ],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Запрос успешен!');
      console.log('   - Ответ:', data.content);
      console.log('   - Провайдер:', data.provider);
      console.log('   - Модель:', data.model);
      console.log('   - Попыток:', data.attempts);
      console.log('   - Время:', data.durationMs + 'ms');
      return true;
    } else {
      const error = await response.text();
      console.log('❌ Ошибка запроса:', response.status);
      console.log('   Детали:', error);
      return false;
    }
  } catch (error) {
    console.log('❌ Не удалось отправить запрос');
    console.log('   Ошибка:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     🧪 Тестирование работы LLM Failover MVP            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const results = [];

  results.push(await testHealth());
  results.push(await testStatus());
  results.push(await testChat());

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 Результаты тестов:');
  console.log('   ✅ Успешных:', results.filter(r => r).length);
  console.log('   ❌ Неудачных:', results.filter(r => !r).length);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (results.every(r => r)) {
    console.log('🎉 Все тесты пройдены! Система работает корректно.\n');
  } else {
    console.log('⚠️  Некоторые тесты не пройдены.');
    console.log('   Проверьте:');
    console.log('   1. Сервер запущен: npm run launch');
    console.log('   2. Файл keys.json содержит реальные API-ключи');
    console.log('   3. Синхронизатор успешно отработал\n');
  }
}

main().catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
