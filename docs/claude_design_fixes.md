# Инструкция для Claude Design: починить адаптив до применения нового дизайна

Скопируй текст ниже целиком в чат Claude Design (проект с дашбордом «Карьеры игроков НБА»).

---

В загруженном дашборде есть три бага вёрстки, исправь их ДО любых дизайнерских
изменений и сохрани исправления при дальнейшем редизайне. Меняй только CSS внутри
`<style id="styles">` — JavaScript, данные и разметку не трогай.

## Баг 1+2. На MacBook (~1512px) и на телефоне ломается раскладка
Симптомы: в карточке «Что если» слайдеры и подписи обрезаются справа; строки на
графике «Расцвет навыков» наезжают друг на друга, потому что две строки карточек
втискиваются в высоту экрана; подписи KPI-индикаторов обрезаются многоточиями.

Исправление: удали из CSS все существующие блоки `@media (max-width: ...)`
и вставь вместо них ровно эти три блока:

```css
/* Средние ширины (ноутбуки ≤1580px): KPI вертикально, карточкам фиксированная
   комфортная высота, страница прокручивается */
@media (max-width: 1580px) {
  body { overflow: auto; }
  .dash { height: auto; gap: 16px; }
  .kpi { min-height: 0; flex-direction: column; align-items: stretch; gap: 6px; }
  .kpi-name { white-space: normal; }
  .kpi-side { flex-direction: row; flex-wrap: wrap; justify-content: flex-start; gap: 4px 12px; }
  .kpi-ind { gap: 5px; }
  .kpi-ind .lbl { overflow: visible; text-overflow: clip; }
  .wi-row > span:last-child { display: none; } /* слова «сезонов»/«годам» — в title */
  .wi-row .wi-lbl { min-width: 0; }
  .grid { grid-template-rows: none; grid-auto-rows: auto; }
  .card.span6, .card.span3 { height: 380px; }
}

/* Планшет (≤1180px): две колонки */
@media (max-width: 1180px) {
  .hdr { flex-wrap: wrap; }
  .filters { flex-wrap: wrap; gap: 12px; }
  .fgroup.actions { padding-left: 0; border-left: 0; }
  .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .row-label { grid-column: 1 / -1; }
  .card.span6 { grid-column: 1 / -1; height: 360px; }
  .card.span3 { grid-column: auto; height: 320px; }
}

/* Телефон (≤700px): одна колонка, «Что если» в общей сетке рядом с пятой карточкой */
@media (max-width: 700px) {
  .dash { padding: 12px 12px 14px; }
  .hdr-title h1 { font-size: 18px; white-space: normal; }
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .kpi { padding: 12px 14px; }
  .kpi-value { font-size: 27px; }
  .grid { grid-template-columns: 1fr; gap: 10px; }
  .card.span6, .card.span3 { grid-column: 1 / -1; height: 320px; }
  .card-head { flex-wrap: wrap; }
}
```

## Баг 3. Дашборд выглядит плоским (особенно на retina-экранах)
Тени карточек однопиксельные и на MacBook исчезают. В переменных тем замени
значение `--shadow`:

```css
/* в блоке :root, [data-theme="dark"] */
--shadow: 0 1px 2px rgba(0,0,0,.32), 0 6px 18px rgba(0,0,0,.26);

/* в блоке [data-theme="light"] */
--shadow: 0 1px 2px rgba(30,34,44,.07), 0 6px 18px rgba(30,34,44,.09);
```

## Проверка
Покажи результат на канвасе в трёх ширинах: 1512 (MacBook Pro), 1920 и 390
(телефон). Критерии приёмки:
- в карточке «Что если» оба слайдера и числа видны целиком, ничего не обрезано;
- строки графика «Расцвет навыков» не наезжают друг на друга;
- подписи под числами KPI видны полностью, без многоточий;
- на 1920 дашборд по-прежнему помещается на один экран без прокрутки;
- карточки заметно отделяются от фона тенью в обеих темах.

Эти правила — обязательная база: при последующем редизайне не удаляй и не
переопределяй их, новые стили добавляй поверх.
