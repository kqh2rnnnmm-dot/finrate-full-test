# Визуальная сверка

Эталон — `LAYOUT_FOLLOWUP_CANDIDATE.html` из архива. Контрольная сумма совпала с `04_REFERENCE_SHA256.txt`.

Снимки получены в Chromium на 320 × 568 в светлой теме и на 390 × 844 в тёмной. В запуск эталона добавлены цветовая схема и размер контейнера просмотра. Эталон и приложение используют разные вымышленные записи. Иконки, которые эталон ожидает от Lucide, в его автономных снимках могут быть пустыми.

| Экран | 320 px, светлая | 390 px, тёмная |
|---|---|---|
| Главная | [Эталон](screens/320-light-home-reference.png) · [Сборка](screens/320-light-home-app.png) | [Эталон](screens/390-dark-home-reference.png) · [Сборка](screens/390-dark-home-app.png) |
| Сводка | [Эталон](screens/320-light-summary-reference.png) · [Сборка](screens/320-light-summary-app.png) | [Эталон](screens/390-dark-summary-reference.png) · [Сборка](screens/390-dark-summary-app.png) |
| Редактор доли | [Эталон](screens/320-light-share-reference.png) · [Сборка](screens/320-light-share-app.png) | [Эталон](screens/390-dark-share-reference.png) · [Сборка](screens/390-dark-share-app.png) |
| Категории | [Эталон](screens/320-light-categories-reference.png) · [Сборка](screens/320-light-categories-app.png) | [Эталон](screens/390-dark-categories-reference.png) · [Сборка](screens/390-dark-categories-app.png) |
| Накопления | [Эталон](screens/320-light-savings-reference.png) · [Сборка](screens/320-light-savings-app.png) | [Эталон](screens/390-dark-savings-reference.png) · [Сборка](screens/390-dark-savings-app.png) |
| Счета и кошельки | [Эталон](screens/320-light-accounts-reference.png) · [Сборка](screens/320-light-accounts-app.png) | [Эталон](screens/390-dark-accounts-reference.png) · [Сборка](screens/390-dark-accounts-app.png) |
| Перевод | [Эталон](screens/320-light-transfer-reference.png) · [Сборка](screens/320-light-transfer-app.png) | [Эталон](screens/390-dark-transfer-reference.png) · [Сборка](screens/390-dark-transfer-app.png) |
| Кредитная карта | [Эталон](screens/320-light-credit-reference.png) · [Сборка](screens/320-light-credit-app.png) | [Эталон](screens/390-dark-credit-reference.png) · [Сборка](screens/390-dark-credit-app.png) |
| Платежи | [Эталон](screens/320-light-payments-reference.png) · [Сборка](screens/320-light-payments-app.png) | [Эталон](screens/390-dark-payments-reference.png) · [Сборка](screens/390-dark-payments-app.png) |
| Планы доходов | [Эталон](screens/320-light-income-plans-reference.png) · [Сборка](screens/320-light-income-plans-app.png) | [Эталон](screens/390-dark-income-plans-reference.png) · [Сборка](screens/390-dark-income-plans-app.png) |

## Расхождения

- В сводке видны «Можно тратить» и план доходов из подключённой месячной модели. На экране категорий использованы показатели новой модели, поэтому блок прежних нераспределённых средств отсутствует.
- Редактор перевода использует цифровое поле и отдельный шаг проверки. Принятый встроенный цифровой блок пока повторён только в обычном расходе и доходе.
- Сводка кредитной карты сворачивается при движении, а заголовок и основное действие остаются на экране. Реакция на жест и нативную прокрутку в Safari требует проверки на iPhone.
- План доходов показывает ожидаемые экземпляры и архив отдельным переходом. В образце архив расположен во вкладке.
- При групповой оплате каждая выбранная запись открывает отдельный редактор и вопрос полноты. Все проверенные записи проводятся одной командой.

Результаты взаимодействий, расчётов и обновления приведены в [матрице A01–A18](../ACCEPTANCE.md).

## Возвраты после действий

- Сводка восстанавливает месяц и позицию списка после просмотра поступлений и сброса черновика доли.
- Категории возвращаются в ту же раскрытую группу меню. Запись расхода из категории возвращает в её расходы.
- Перевод из карточки возвращается в неё. После отмены записи в истории счёта видна отметка.
- Платежи сохраняют выбранные вкладку и день после просмотра. После отмены закрывающей записи остаётся ранее оплаченная часть.
