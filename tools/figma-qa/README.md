# Figma QA Bridge 0.1.0 — локальный инструмент

Переносимая версия QA Bridge. Node.js ≥22.12, без UI, CSS-исправлений, pixel diff и автоматического обновления baseline. Работает из локальной папки релиза; не требует публикации в npm. `png.mjs` — неизменённый валидатор Figma Design Downloader v0.2.0. Оригинальные Downloader и Veles Steel не изменяются.

## Подключение за две команды

Из папки нового frontend-проекта с существующим `package.json`:

```sh
node /absolute/path/to/figma-qa-bridge/cli.mjs install --project .
npm run qa:configure -- --metadata /absolute/path/to/figma-export/metadata.json --route /preview --ready-selector '[data-qa-ready]' --base-url http://127.0.0.1:4173
```

Windows: пути с пробелами заключайте в кавычки. `--metadata` принимает настоящий экспорт Downloader schemaVersion 2, PNG 1×. Из него автоматически извлекаются файл, nodeId, SHA-256, размеры и viewport. Перед копированием проверяются PNG, SHA, размеры и metadata. Затем PNG и metadata копируются в `.figma-qa/references/default/`, создаётся `qa.manifest.json`. Ни оригинал, ни существующая конфигурация не перезаписываются.

Проверка после настройки — одна команда:

```sh
npm run qa:visual
```

Отчёты в новой `.figma-qa/results/run-*`: HTML с изображениями рядом, Markdown-сводка, JSON diagnostics, `actual.png`, проверенная копия `reference.png`, лог запущенного сервера. Exit code 0 = технический PASS, 1 = FAIL. Визуальное сходство оценивает человек. Каждый запуск создаёт новый отчёт; baseline никогда не обновляется.

## Playwright и Figma MCP

Инструмент ищет Playwright **в frontend-проекте**: сначала `playwright`, затем `@playwright/test`, затем `playwright-core`, включая hoisted зависимости. Второй test runner и свой браузер не устанавливает. Существующий Playwright config не читает и не меняет. Если Playwright уже есть и Chromium установлен, дополнительных действий нет.

Если отсутствуют:

```sh
npm install -D playwright
npx playwright install chromium
```

Это две явные одноразовые команды пользователя; installer не меняет зависимости и lockfile. Можно применять штатный package manager проекта. На Linux browser dependencies иногда требуют `npx playwright install --with-deps chromium`. Альтернатива установленного браузера: `QA_BROWSER_CHANNEL=msedge` или `chrome` через окружение. При использовании только playwright-core запускайте установку браузера его CLI с совпадающей версией.

Figma MCP повторно устанавливать и авторизовывать не нужно. Для нового экспорта используется уже подключённый MCP и Downloader 0.2.0; здесь потребляется локальный проверенный PNG + metadata. Локальный Node-процесс не получает OAuth Codex и не вызывает MCP самостоятельно. Не сохраняйте временные MCP URL в manifest.

## Ещё один маршрут / обычный PNG

```sh
npm run qa:configure -- --name catalog --metadata /exports/catalog/metadata.json --route /catalog --ready-selector '#catalog-ready'
npm run qa:visual -- qa.catalog.manifest.json
```

Альтернатива без metadata (проверяет PNG/SHA/размеры, но не доказывает происхождение из Figma):

```sh
npm run qa:configure -- --name checkout --reference /exports/checkout.png --node-id 123:456 --route /checkout --viewport 1440x900
```

Viewport по умолчанию берётся из физических размеров PNG. При `--viewport WIDTHxHEIGHT` он должен совпадать с PNG (DSF=1); масштабирование эталона не выполняется. Указывать `--node-id` можно для выбора одного frame в metadata. `--name` создаёт отдельный новый manifest/reference, а не заменяет старый. Для изменений маршрута используйте новое имя или отредактируйте manifest вручную; CLI не перезаписывает его.

## React / Vite / Next.js / существующий сервер

`configure` определяет Vite/Next по dependencies/devDependencies проекта. Вызывает установленный CLI напрямую через Node с фиксированным локальным портом: Vite `--host 127.0.0.1 --port PORT --strictPort`; Next `dev --hostname 127.0.0.1 --port PORT`. Настройки приложения остаются прежними. Vite history fallback не доказывает существование SPA-маршрута — обязательно задайте специфичный `--ready-selector`. Для Next компиляция может требовать увеличения `--timeout 60000`.

Если нужны собственный dev script, env setup, monorepo wrapper, CRA или другой React bundler, запустите сервер отдельно и используйте `--framework existing`. Либо передайте доверенную JSON argv-команду:

```sh
npm run qa:configure -- --name custom --metadata /exports/metadata.json --route / --framework existing --base-url http://127.0.0.1:3000
```

`--server-command '["node","scripts/dev.mjs"]'` задаёт собственный запуск без shell. Windows `.cmd` напрямую не исполняется: используйте Node entrypoint или предварительно запущенный сервер. Cwd запуска — корень проекта, где находится сгенерированный manifest. Сервер, который уже отвечает 2xx на `readyPath`, переиспользуется и остаётся запущенным. Останавливаются только процессы собственного запуска (Windows process tree / POSIX process group). Не используйте daemon-команды.

## Безопасная установка

Installer копирует **только собственные исходники** в `tools/figma-qa/` и добавляет два отсутствующих scripts: `qa:visual`, `qa:configure`. Копировать исходники вручную не нужно. Все остальные scripts, dependencies и поля package.json сохраняются. Formatting package.json сохраняет отступы; сериализация может изменить форматирование. Lockfile, Vite/Next/Playwright config, исходники приложения, AGENTS.md, .gitignore и MCP settings не меняются.

При занятом npm script вся установка отклоняется **до записи**. Автоматического подтверждения, `--force` или скрытого overwrite нет. Можно выбрать свободные имена:

```sh
node /release/cli.mjs install --project . --script qa:figma --configure-script qa:figma:configure
```

Повторный install проверяет ownership и хеши, возвращает `already-installed`; update — отдельная операция. Без собственного ownership-state существующую `tools/figma-qa` не трогает. Symlink/junction вместо управляемых директорий и package.json отклоняется. Изменённые или неизвестные файлы блокируют update/uninstall. `.figma-qa/install.json` хранит версию, hashes и принадлежащие инструменту npm scripts. Не редактируйте этот ledger.

Записи выполняются поэтапно с rollback при обычной ошибке. Это не атомарная транзакция нескольких файлов при аварийном отключении питания/kill процесса. Не запускайте несколько installer/update/uninstall одновременно. Manifest — доверенный локальный input: `server.command` разрешает выполнение указанной программы.

Добавьте `.figma-qa/results/` в свой .gitignore при необходимости; installer не меняет его автоматически. References и manifests можно хранить в Git. Экспортированные designs могут быть приватными — политику хранения определяет проект.

## Обновление

Распакуйте новый релиз рядом со старым; выполните CLI **из нового релиза**:

```sh
node /new-release/cli.mjs update --project /frontend
npm run qa:visual
```

Сверяются ownership hashes и значения управляемых scripts. Если они изменены — операция отклоняется без overwrite. При успехе заменяются только файлы `tools/figma-qa/` и ownership ledger. Manifests, references, reports, app scripts/config и зависимости сохраняются. Повторный update возвращает `up-to-date`. Сохраните старый релиз: им можно выполнить тот же update для явного отката версии. Совместимость схем manifest проверяйте в release notes; версия 0.1.0 использует schemaVersion=1.

## Удаление

```sh
node tools/figma-qa/cli.mjs uninstall
```

Удаляются только неизменённые owned tool-файлы, ledger и два принадлежащих инструменту npm script. Остальные package.json-поля/scripts сохраняются. **References, manifests, reports и зависимости остаются** для сохранности и аудита. Их удаление или `npm uninstall` общей Playwright-зависимости выполняется пользователем отдельно после проверки других тестов. Повторное удаление без ownership выдаёт ошибку и ничего не трогает. Если installer заблокирован локальными правками, сохраните их и восстановите managed files/scripts вручную; опции обхода проверки нет.

Диагностика: `node tools/figma-qa/cli.mjs doctor`. После удаления можно снова установить инструмент; ранее настроенный manifest будет работать без повторного configure.

## Ограничения

Один route/viewport на manifest; одинаковые размеры PNG и viewport, статический PNG 1×. Manifest расположен в корне frontend-пакета; в monorepo указывайте пакет, а не общий workspace root. Локальный HTTP, Chromium; DSF=1, locale=en-US/timezone=UTC по умолчанию (можно задать locale/timezoneId в manifest). SPA soft-404, auth и business-state требуют собственного readySelector/подготовленного сервера. Нет автоматического CSS fix, pixel diff, длительного мониторинга или автоматического импорта Playwright config. POSIX-код предусмотрен, но проверка в этой поставке выполнялась на Windows. Реальный E2E выполнен на независимом React/Vite-проекте; Next-адаптер проверяется контрактным тестом, полноценный Next E2E не заявляется.

Архитектура: `cli.mjs` — безопасное управление и manifests; `runner.mjs` — независимый browser/report pipeline из исходного Bridge; `png.mjs` — validator Downloader. Поставляемый CLI самодостаточен, runtime-browser переиспользуется из frontend. Официальные контракты CLI: [Vite](https://vite.dev/guide/cli), [Next](https://nextjs.org/docs/app/api-reference/cli/next), [Playwright Library](https://playwright.dev/docs/library).

Тесты дистрибутива: `npm test` (Node safety/lifecycle), затем `npm run test:browser` с `QA_TEST_PROJECT`, указывающим на отдельный настроенный frontend с установленным Playwright. Тестовый fixture содержит копию реального Figma-экспорта; исходный Veles для тестов не нужен. При установке в frontend переносятся только пять runtime-файлов, а не тесты и их fixtures.
