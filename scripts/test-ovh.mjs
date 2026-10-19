#!/usr/bin/env node
/**
 * Простой тест: отправляет запрос к OVHcloud без ключа
 * Запуск: node scripts/test-ovh.mjs
 */

console.log('🧪 Тест: отправка запроса к OVHcloud (без ключа)...\n');

const response = await fetch('https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-oss-20b',
    messages: [
      { role: 'user', content: 'Скажи "Привет" одним словом' }
    ],
    max_tokens: 50,
  }),
});

console.log('Статус:', response.status);
console.log('Заголовки:', Object.fromEntries(response.headers.entries()));

const data = await response.json();
console.log('\nОтвет:');
console.log(JSON.stringify(data, null, 2));

if (data.choices?.[0]?.message?.content) {
  console.log('\n✅ УСПЕХ! Модель ответила:', data.choices[0].message.content);
} else if (data.error) {
  console.log('\n❌ ОШИБКА:', data.error.message || data.error);
} else {
  console.log('\n⚠️  Неожиданный формат ответа');
}
