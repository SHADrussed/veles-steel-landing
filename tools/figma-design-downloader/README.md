# Figma Design Downloader 0.2.0

Небольшой CLI для сохранения материалов Figma в frontend-проект. Node.js 22+, без npm-зависимостей и UI. Существующее приложение и его package.json не меняются.

Экспорт делегирован подключённому Figma MCP `download_assets`; REST fallback отсутствует. Доступность инструмента и OAuth-сессии проверяется в вашей среде. Исторический пример экспорта из версии 0.1.0 сохранён; новый живой экспорт в проверку 0.2.0 не входит.

## Установка

Скопируйте эту папку в проект, например в `tools/figma-design-downloader/`. Установите Node.js 22 или новее. `npm install` не нужен.

Из корня вашего проекта:

```powershell
node tools/figma-design-downloader/cli.mjs --help
node tools/figma-design-downloader/cli.mjs parse 'https://www.figma.com/design/FILE_KEY/Name?node-id=123-456'
node --test tools/figma-design-downloader/test/downloader.test.mjs tools/figma-design-downloader/test/integrity.test.mjs
```

Все команды экспорта по умолчанию пишут в `design-reference/` относительно **текущей рабочей директории**, а не расположения CLI. Поставляемый `.gitignore` действует только внутри папки инструмента. Глобальная команда `figma-download` от копирования папки не появляется; используйте `node .../cli.mjs`.

### Подключение инструкции Codex к проекту

После копирования папки выполните из корня целевого проекта:

```powershell
node tools/figma-design-downloader/cli.mjs install-codex
```

Команда добавляет помеченный блок со ссылкой на CODEX.md в корневой `AGENTS.md` и исключения `/design-reference/`, `/.figma-work/` в корневой `.gitignore`. Существующее содержимое сохраняется; повторный запуск не дублирует блоки. Также доступен `--project <путь-к-корню>`. Инструмент должен находиться внутри подпапки проекта, иначе установка отклоняется. Приложение и package.json не меняются.

Если существует `AGENTS.override.md`, установка остановится: вручную добавьте в него ссылку на CODEX.md и исключения в `.gitignore`. При повреждённых маркерах, symlink вместо файла или обычного каталога установка не пытается заменить правила. Два файла записываются последовательно, общей файловой транзакции нет. Проверяйте их diff после установки. Настройки пользователя и подключение OAuth эта команда не меняет; вложенные инструкции Codex могут иметь более высокий приоритет.

Без установки можно явно попросить Codex прочитать CODEX.md. Он является workflow-документом, не зарегистрированным skill или самостоятельным плагином. Механизм инструкций: [официальное руководство AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

## Основной workflow: Codex + подключённый Figma MCP

Подключите и авторизуйте Figma в Codex. CLI-процесс не может заимствовать OAuth-сессию приложения. В [CODEX.md](CODEX.md) описан workflow: агент вызывает официальные инструменты, передаёт их JSON-ответ локальному CLI, а CLI скачивает байты и сохраняет metadata.

Автоматическая маршрутизация в новом проекте появляется после `install-codex` либо ручной ссылки из его действующих инструкций. Наличие настройки в другом workspace не переносится вместе с ZIP.

Пример запроса Codex после копирования папки:

> Прочитай tools/figma-design-downloader/CODEX.md и скачай PNG этого фрейма в текущий проект: https://www.figma.com/design/FILE_KEY/Name?node-id=123-456

Или для ссылки на файл:

> Используй tools/figma-design-downloader/CODEX.md для этой ссылки. Покажи страницы, затем верхнеуровневые фреймы выбранной страницы для выбора. Экспорт пока не запускай: https://www.figma.com/design/FILE_KEY/Name

Затем:

> Скачай выбранные фреймы 123:456 и 123:789 в PNG. Также сохрани SVG ассеты и исходные изображения.

MCP возвращает временные URL. По умолчанию workflow использует PNG 1×; иной масштаб задаётся явно. При необходимости агент согласует формат/масштаб перед экспортом согласно правилам подключённого инструмента. CLI сохраняет только запрошенные типы материалов: `--raw` включает исходные image fills, `--svg-assets` — отдельные векторные ассеты. Для SVG **всего фрейма** нужен отдельный экспорт. PNG и SVG — отдельные наборы файлов.

## Самостоятельный CLI через MCP HTTP

CLI поддерживает Streamable HTTP (JSON/SSE), initialize, session ID и tools/list. Он проверяет наличие `download_assets` **до экспорта**.

Официальный endpoint: `https://mcp.figma.com/mcp`. Для удалённого MCP требуется OAuth; доступ нового клиента может требовать одобрения Figma. См. [официальную настройку](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/). Набор инструментов endpoint может отличаться от плагина Codex. Если там отсутствует `download_assets`, используйте workflow Codex выше.

Передайте действующий OAuth access token, уже полученный вашим разрешённым MCP-клиентом, через `FIGMA_MCP_TOKEN`. CLI не реализует OAuth-вход/refresh и не принимает токен аргументом. Figma Personal Access Token для этого режима не подходит. Не вставляйте токены в команды, файлы проекта или README.

```powershell
# FIGMA_MCP_TOKEN передан через окружение/менеджер секретов.
node tools/figma-design-downloader/cli.mjs list 'https://www.figma.com/design/FILE_KEY/Name'
node tools/figma-design-downloader/cli.mjs list 'https://www.figma.com/design/FILE_KEY/Name' --page 0:1

# Выбранные фреймы одной страницы
node tools/figma-design-downloader/cli.mjs download 'https://www.figma.com/design/FILE_KEY/Name' --page 0:1 --nodes 123:456,123:789

# Ссылка на frame — сразу экспорт PNG
node tools/figma-design-downloader/cli.mjs download 'https://www.figma.com/design/FILE_KEY/Name?node-id=123-456'

# Явный экспорт 2×; фактические пиксели будут проверены
node tools/figma-design-downloader/cli.mjs download 'https://www.figma.com/design/FILE_KEY/Name?node-id=123-456' --scale 2

# SVG всего фрейма и дополнительные assets
node tools/figma-design-downloader/cli.mjs download 'https://www.figma.com/design/FILE_KEY/Name?node-id=123-456' --format svg --svg-assets --raw

# Только явное --all экспортирует все верхнеуровневые фреймы выбранной страницы
node tools/figma-design-downloader/cli.mjs download 'https://www.figma.com/design/FILE_KEY/Name' --page 0:1 --all
```

Без выбора CLI в терминале предлагает номера страниц/фреймов. В CI нужны явные page/nodes либо ссылка на конкретный frame. Для другого MCP endpoint используйте `--mcp-url` или `FIGMA_MCP_URL`. Поддерживаются HTTPS и локальный HTTP на loopback. Указанный endpoint получает FIGMA_MCP_TOKEN: не передавайте токен непроверенному серверу. Direct HTTP режим требует совместимой схемы single-node `download_assets`, в том числе `defaultScale`; обнаружение инструмента не адаптирует произвольный MCP API.

## Передача результата MCP в CLI

Это рабочий мост для подключённого плагина Codex. Принимает как весь CallToolResult (`content`/`structuredContent`), так и непосредственно JSON `download_assets`.

`node-info.json` — проверенные metadata конкретного frame:

```json
{"id":"123:456","name":"Главная","width":1920,"height":1080}
```

```powershell
node tools/figma-design-downloader/cli.mjs import 'https://www.figma.com/design/FILE_KEY/Name?node-id=123-456' --response .figma-work/export.response.json --node-info .figma-work/node-info.json --scale 1
```

Для сохранения дополнительных материалов добавьте `--raw --svg-assets`. `--response -` читает JSON из stdin. Временные ответы MCP содержат секретные ссылки: храните их в игнорируемой `.figma-work/`, удаляйте сразу после импорта. Не сохраняйте весь ответ MCP в metadata или логах CI.

Import сам не вызывает Figma и не удаляет входной JSON. `--scale` здесь означает ожидаемый масштаб уже полученного экспорта: для PNG 2× используйте `--scale 2`, предварительно запросив тот же масштаб у MCP. Подмена масштаба не исправляет неверные metadata; размеры сверяются с переданным node-info, достоверность которого обеспечивает вызывающий агент.

`catalog --response <json>` преобразует ответ `get_metadata` (XML внутри CallToolResult) либо `{frames:[...]}` / `{pages:[...]}` в JSON-список. Неподдерживаемая схема завершается понятной ошибкой. Для подключения с иной схемой используйте ограниченное чтение через `use_figma`, описанное в CODEX.md.

## Результат

```text
design-reference/
  FILE_KEY/
    2026-10-21T...-unique-id/
      Главная--123-456-0.png
      image-1--123-456-1.jpeg       # только --raw
      vector-1--123-456-2.svg       # только --svg-assets
      metadata.json
```

Каждый импорт имеет отдельную папку; предыдущие результаты не перезаписываются. Новая metadata имеет `schemaVersion: 2`: логические размеры frame — `node.width/height`, ожидаемый масштаб — `exportScale`, физические размеры PNG — `files[].image.width/height`. Каждый сохранённый файл имеет SHA-256, формат и размер в байтах. Источник сохраняется без tracking. Для ассетов без собственного node ID записывается `null`. Старый пример в examples/live-export остаётся исторической metadata schemaVersion 1.

### Проверка PNG и размеров

Проверяются сигнатура, границы chunks и CRC каждого chunk, обязательные IHDR/IDAT/IEND и их порядок, допустимые цвет/глубина/чересстрочность, целостность zlib/Adler32, точный объём распакованных строк, фильтры и индексы палитры. Поддерживаются статические PNG, включая Adam7 и 16-bit. APNG отклоняется явно. Сжатые вспомогательные metadata/цветовые профили не интерпретируются; это проверка целостности основного изображения, не универсальный валидатор всех семантических требований PNG.

Для PNG всего frame размеры должны быть ровно `max(1, round(node.width × scale))` и аналогично для height. Допусков и автоматического растяжения нет. Несовпадение (в том числе из-за теней/экспортных границ или иной политики округления сервера) даёт ошибку до записи PNG: проверьте правильность frame, metadata и настроек экспорта. Raw PNG также проверяется на целостность, но его размеры не сравниваются с размером frame.

Защита от чрезмерной распаковки: максимум 64 млн пикселей, 256 MiB данных строк и 100 000 chunks на PNG. `--scale` принимает 0.01–4, по умолчанию 1. Для SVG размер пикселей не проверяется. JPEG/GIF/WebP/original проверяются только поверхностно; проверка PNG на них не распространяется.

Имена очищаются от разделителей пути, управляющих символов и Windows device names; кириллица сохраняется. Symlink-каталоги вывода отклоняются. Временные asset URL и OAuth-токены не включаются в штатные поля metadata; нормализованный Figma sourceUrl сохраняется намеренно. Asset URL ограничены HTTPS-доменами семейств Figma/AWS/CloudFront; это не доказательство принадлежности AWS/CloudFront tenant компании Figma. Авторизационные заголовки к asset URL не передаются, HTTP redirect отклоняется. SVG не очищается от активного содержимого: не вставляйте его inline в будущий QA-report без отдельной обработки.

## Ошибки и ограничения

- 401/403: переподключите Figma MCP, проверьте права; для asset повторите экспорт, если истёк URL.
- 429 и временные 5xx: до трёх HTTP-попыток, учитывается Retry-After. При ожидании больше 30 секунд CLI завершится с подсказкой, чтобы не зависать надолго.
- Ошибка MCP-инструмента: понятное сообщение, без автоматического повторения экспорта. Диагностика доступа/лимитов в Codex через `whoami`.
- Неудачные загрузки не скрываются: остальные выбранные файлы сохраняются, ошибки попадают в metadata, exit code `1`. Успех — `0`.
- Пустые/неверные ID, неизвестные форматы, несовпадение node ID, повреждённый или неверного размера PNG, сетевые таймауты и файлы больше 100 MiB отклоняются. Общий объём всех файлов/импортного JSON и время всего запуска не ограничены.
- MCP ограничивает исходные изображения и SVG ассеты двадцатью каждого вида на вызов. Флаги `rawImagesTruncated`/`svgAssetsTruncated` отражаются предупреждениями. Полное извлечение произвольного дерева ассетов за пределами MCP в MVP не реализовано.
- Страницы не обходятся автоматически. Верхнеуровневые frames — прямые дети страницы и frames внутри sections, без вложенных frames, компонентов и instances.
- REST fallback намеренно отсутствует: в проверенной среде официальный `download_assets` доступен. Если впоследствии MCP исчезнет, этот вариант честно завершит работу; REST-адаптер потребует отдельного расширения.

## Проверка

См. [VALIDATION.md](VALIDATION.md). Реальный PNG из предоставленного макета и metadata находятся в `examples/live-export/`; список 49 фреймов страницы — в [examples/frames.json](examples/frames.json). Автотесты не требуют доступа к Figma, токенов и npm-пакетов.

## Минимальная связка с visual QA

Для одного frame и одного route примите PNG 1× после успешного import: сохраните стабильный путь, SHA-256, физические размеры, node ID, route, viewport и deviceScaleFactor=1 в manifest проекта. Playwright снимает соответствующий экран после загрузки данных/шрифтов. Первый отчёт показывает эталон и текущий PNG рядом, ошибки страницы и overflow. Длинному frame отдельно задайте fullPage/область снимка; его высота не обязательно равна высоте viewport. Новые экспорты не обновляют одобренный эталон автоматически. Runner, pixel diff и команда qa:design в эту поставку не включены.
