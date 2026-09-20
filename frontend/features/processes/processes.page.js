    function readProcessCatalogLanguage() {
      try {
        const storedLanguage = window.localStorage.getItem(PROCESS_CATALOG_LANGUAGE_STORAGE_KEY);
        return storedLanguage === "en" ? "en" : "ru";
      } catch (_error) {
        return "ru";
      }
    }

    let processCatalogLanguage = readProcessCatalogLanguage();

    const MANUAL_BATCH_PROCESS_STAGES = Object.freeze({
      select: Object.freeze({
        theme: "is-input",
        icon: "checklist",
        kicker: "01 · Input",
        title: "Trade Selection for Batch Formation",
        objective: "Freeze the operator's eligible Position selection for deterministic Manual Batching.",
        steps: Object.freeze([
          Object.freeze({ boundary: "Browser", title: "Read the current Position selection.", detail: "Resolve selectedTradeIds against rows currently displayed for the active currency pair." }),
          Object.freeze({ boundary: "Browser", title: "Keep only Trades eligible for Batching.", detail: "Exclude synthetic rows and require a positive Trade ID, BUY or SELL side, and a positive Transfer Rate." }),
          Object.freeze({ boundary: "Browser", title: "Create an eligible Trade snapshot.", detail: "Copy the matching Position rows into sourceDeals for the next stage. The mutable checkbox state itself remains browser-only." })
        ]),
        controls: Object.freeze([
          Object.freeze({ check: "At least one eligible Trade remains after filtering.", failure: "Show a warning and stop before any request is sent." }),
          Object.freeze({ check: "Every selected source exposes the minimum data required by the batching UI.", failure: "Ignore the non-batchable row; Position and the database remain unchanged." })
        ]),
        artifacts: Object.freeze([
          Object.freeze({ kind: "Input", name: "selectedTradeIds: Set", scope: "Browser", purpose: "Mutable checkbox selection maintained by Position." }),
          Object.freeze({ kind: "Runtime", name: "sourceDeals: PositionRow[]", scope: "Browser", purpose: "Eligible source rows captured from the current display." }),
          Object.freeze({ kind: "Output", name: "eligible source snapshot", scope: "Manual Batching process", purpose: "Captured set of eligible Trades for further processing." })
        ]),
        traceability: Object.freeze([
          Object.freeze({ label: "Persistence", value: "Not persisted. The checkbox selection exists only in browser memory." }),
          Object.freeze({ label: "Audit", value: "No audit record is created at this stage." }),
          Object.freeze({ label: "Application logging", value: "No stage event is emitted; only the user-facing warning/status may change." })
        ]),
        result: "Eligible Trade snapshot captured from the current Position state."
      }),
      tenor: Object.freeze({
        theme: "is-tenor",
        icon: "alt_route",
        kicker: "02 · Decision",
        title: "Resolve Batching Key",
        objective: "Resolve a mixed Batching Key selection to one compatible Trade set for one Batch.",
        steps: Object.freeze([
          Object.freeze({ boundary: "Browser", title: "Group by the complete Batching Key.", detail: "Use Ccy Pair, currency precision, Trade Date, Tenor and both Value Dates while retaining the eligible source rows in each group." }),
          Object.freeze({ boundary: "Browser", title: "Choose one compatible group.", detail: "A single Batching Key continues directly. For a mixed selection, the dealer chooses one group; the browser never creates independent batches for the remaining groups." }),
          Object.freeze({ boundary: "Browser", title: "Prepare the immutable request identity.", detail: "Sort numeric tradeIds and generate one idempotencyKey for the exact selection." }),
          Object.freeze({ boundary: "API", title: "Submit the Manual Batching command.", detail: "POST tradeIds to /api/v1/batches, with the idempotencyKey in the request header." })
        ]),
        controls: Object.freeze([
          Object.freeze({ check: "Technical FX Swap neutralization is not implemented and Cross-Tenor Batching remains disabled.", failure: "A mixed Batching Key cannot be submitted as one Batch; user resolution is required." }),
          Object.freeze({ check: "The selected Batching Key group contains at least one eligible source Trade.", failure: "Do not submit an empty compatibility group." })
        ]),
        artifacts: Object.freeze([
          Object.freeze({ kind: "Input", name: "sourceDeals: PositionRow[]", scope: "Browser", purpose: "Eligible Trades received from Stage 01." }),
          Object.freeze({ kind: "Runtime", name: "compatibilityGroups: Map<BatchingKey, Trade[]>", scope: "Browser", purpose: "UI decision model for a mixed Batching Key selection." }),
          Object.freeze({ kind: "Output", name: "tradeIds: number[]", scope: "API command", purpose: "Sorted Trade IDs submitted to the server." }),
          Object.freeze({ kind: "Output", name: "idempotencyKey: UUID", scope: "Request header", purpose: "Stable identity reused when the exact request is retried." })
        ]),
        traceability: Object.freeze([
          Object.freeze({ label: "Persistence", value: "No durable write occurs until the server transaction starts in Stage 03." }),
          Object.freeze({ label: "Audit", value: "The exact Trade selection is recorded later as Batch membership if the transaction commits." }),
          Object.freeze({ label: "Application logging", value: "No separate event records the dialog choice." })
        ]),
        result: "One compatible Trade selection with sorted Trade IDs and a stable idempotency key."
      }),
      validate: Object.freeze({
        theme: "is-validation",
        icon: "fact_check",
        kicker: "03 · Control",
        title: "Verify Command & Selection",
        objective: "Verify the command and rebuild one authoritative eligible Trade selection inside one database transaction.",
        steps: Object.freeze([
          Object.freeze({ boundary: "Application", title: "Normalize the command.", detail: "Require a valid idempotency key and 1–200 unique positive Trade IDs; then sort the IDs." }),
          Object.freeze({ boundary: "DB", title: "Resolve an existing Batch by idempotency key.", detail: "Replay the matching completed Batch, or reject reuse of the key for different Trade IDs or a different formation reason." }),
          Object.freeze({ boundary: "DB", title: "Rebuild the authoritative source selection.", detail: "Load the complete current Trade records for every requested ID; reject missing, unavailable, already batched and unsupported technical Trades." }),
          Object.freeze({ boundary: "Domain", title: "Verify the complete Batching Key.", detail: "Require one currency pair, Trade Date, Tenor, both Value Dates and compatible currency precision for the entire selection." })
        ]),
        controls: Object.freeze([
          Object.freeze({ check: "Idempotency key, formation reason and sorted Trade IDs match any prior completed Batch.", failure: "Return the prior Batch on an exact replay; reject a conflicting command." }),
          Object.freeze({ check: "Every requested Trade is currently eligible and has valid baseline source data, including Side, Tenor and Transfer Rate.", failure: "Abort before persistence; no Batch becomes durable." }),
          Object.freeze({ check: "Stage 04 revalidates the single selection and its Batching Key at the domain boundary.", failure: "A domain failure rolls back the transaction." })
        ]),
        artifacts: Object.freeze([
          Object.freeze({ kind: "Input", name: "{ idempotencyKey, tradeIds }", scope: "Application", purpose: "Manual batching command received from the API." }),
          Object.freeze({ kind: "Runtime", name: "normalized", scope: "Application", purpose: "Canonical command with sorted Trade IDs." }),
          Object.freeze({ kind: "Output", name: "sourceTrades[]", scope: "Stage 04", purpose: "One complete authoritative selection for one Batch." })
        ]),
        traceability: Object.freeze([
          Object.freeze({ label: "Persistence", value: "No durable row exists until the Batch aggregate is persisted in Stage 05." }),
          Object.freeze({ label: "Audit", value: "batches stores the public idempotency key; batch_members stores the exact source Trade selection." }),
          Object.freeze({ label: "Application logging", value: "No per-check event or replay-attempt event is emitted." })
        ]),
        result: "One verified authoritative Trade selection ready for Batch formation."
      }),
      form: Object.freeze({
        theme: "is-domain",
        icon: "calculate",
        kicker: "04 · Domain",
        title: "Form & Neutralize",
        objective: "Form one Batch model with zero Base Currency position and neutral Quote Currency cash.",
        steps: Object.freeze([
          Object.freeze({ boundary: "Application", title: "Pass the verified source selection to the domain.", detail: "Use the authoritative records rebuilt in Stage 03 without a second database read." }),
          Object.freeze({ boundary: "Domain", title: "Revalidate the group and its Batching Key.", detail: "Recheck every source invariant and require one pair, Trade Date, Tenor, both Value Dates, currency precision, positive amounts and positive Transfer Rates." }),
          Object.freeze({ boundary: "Domain", title: "Calculate source Trade balance contributions.", detail: "Compute signed Base Currency and Quote Currency balances plus exact Transfer Rate-based Quote Currency amounts in minor units." }),
          Object.freeze({ boundary: "Domain", title: "Neutralize a non-zero Base Currency position.", detail: "Use the imbalance-producing side's Base Currency-weighted Transfer Rate to create an opposite Balance Trade and mirrored Position Out." }),
          Object.freeze({ boundary: "Domain", title: "Neutralize Quote Currency cash.", detail: "Create Quote Cash Out opposite to the remaining Quote Currency balance. This output is created even for a flat or zero-cash result." })
        ]),
        controls: Object.freeze([
          Object.freeze({ check: "All members share one Batching Key and current currency precision.", failure: "Reject the group and roll back the entire manual operation." }),
          Object.freeze({ check: "Each source Trade amount fits safe minor-unit storage and has a positive Transfer Rate.", failure: "Reject before the Batch can reach FORMED status." }),
          Object.freeze({ check: "Batch members plus Balance Trade have Base Currency OVP 0; Quote Cash Out brings Quote Currency cash to 0.", failure: "Database formation guards prevent the Batch from being marked FORMED." })
        ]),
        artifacts: Object.freeze([
          Object.freeze({ kind: "Input", name: "sourceTrades[]", scope: "Domain", purpose: "Complete Trades sharing one Batching Key." }),
          Object.freeze({ kind: "Runtime", name: "netBaseCcyAmountMinor", scope: "Domain", purpose: "Signed Base Currency position of source Trades." }),
          Object.freeze({ kind: "Runtime", name: "netQuoteCcyAmountMinor", scope: "Domain", purpose: "Signed Quote Currency cash contribution of source Trades." }),
          Object.freeze({ kind: "Output", name: "formation.balanceTrade?", scope: "Stage 05", purpose: "Optional member created only when the Base Currency position is non-zero." }),
          Object.freeze({ kind: "Output", name: "formation.positionOut?", scope: "Stage 05", purpose: "Optional output mirroring the Balance Trade when the Base Currency position is non-zero." }),
          Object.freeze({ kind: "Output", name: "formation.quoteCashOut", scope: "Stage 05", purpose: "Mandatory Quote cash output, including a possible zero amount." })
        ]),
        traceability: Object.freeze([
          Object.freeze({ label: "Persistence", value: "The formation object is calculated in memory; its records are inserted by the repository before the outer transaction commits." }),
          Object.freeze({ label: "Audit", value: "The Batch carries formation reason MANUAL_SELECTION with selectedTradeCount." }),
          Object.freeze({ label: "Application logging", value: "Intermediate net balances and individual domain decisions are not emitted as stage events." })
        ]),
        result: "Neutral formation model containing source members, optional technical Trades and mandatory Quote Cash Out."
      }),
      commit: Object.freeze({
        theme: "is-commit",
        icon: "database",
        kicker: "05 · Commit",
        title: "Commit & Refresh",
        objective: "Persist one Batch atomically and refresh the operator's Position.",
        steps: Object.freeze([
          Object.freeze({ boundary: "DB", title: "Persist the Batch aggregate.", detail: "Insert batches, all members, optional technical Trade extensions and mandatory Quote Cash Out; then mark the Batch FORMED." }),
          Object.freeze({ boundary: "DB", title: "Commit one aggregate transaction.", detail: "Commit only after the complete Batch passes all database integrity checks." }),
          Object.freeze({ boundary: "API", title: "Return the formed Batch.", detail: "Respond with the single batchId, formation data and replayed flag." }),
          Object.freeze({ boundary: "Browser", title: "Refresh Position after success.", detail: "Reload DB-backed Position, remove only submitted rows from the UI selection and render the refreshed position." })
        ]),
        controls: Object.freeze([
          Object.freeze({ check: "The complete Batch aggregate reaches FORMED before commit.", failure: "A server transaction error rolls back the aggregate; Position data remains unchanged." }),
          Object.freeze({ check: "The HTTP response is received and Position reload succeeds.", failure: "If refresh fails after commit, the Batch remains formed in the database and the UI reports an error until reloaded." })
        ]),
        artifacts: Object.freeze([
          Object.freeze({ kind: "Input", name: "formation + sourceTrades[]", scope: "Repository", purpose: "Complete result for the single Batch." }),
          Object.freeze({ kind: "Output", name: "batches / members / outputs", scope: "Database", purpose: "Durable Batch aggregate, membership and output records." }),
          Object.freeze({ kind: "Output", name: "{ batchId, replayed, ...batch }", scope: "API response", purpose: "Single Batch result returned to the browser." }),
          Object.freeze({ kind: "Output", name: "refreshed positions", scope: "Browser", purpose: "Position with formed batch members excluded and Position Out visible when present." })
        ]),
        traceability: Object.freeze([
          Object.freeze({ label: "Persistence", value: "batches, batch_members, trade_exposures and specialized technical records are committed together." }),
          Object.freeze({ label: "Audit", value: "The public idempotency key, immutable membership, formation reason/details and v_batch_formation_audit provide durable traceability." }),
          Object.freeze({ label: "Application logging", value: "There is no separate success/failure event log for each process stage or UI refresh." })
        ]),
        result: "One durable formed Batch and a refreshed Position; an exact retry replays the same result."
      })
    });
    const MANUAL_BATCH_PROCESS_STAGES_RU = Object.freeze({
      select: Object.freeze({
        theme: "is-input",
        icon: "checklist",
        kicker: "01 · Вход",
        title: "Выбор Trades для создания Batch",
        objective: "Зафиксировать корректный набор Trades, выбранных пользователем в Position, для создания Batch.",
        steps: Object.freeze([
          Object.freeze({ boundary: "Браузер", title: "Получить выбранные Trades из Position.", detail: "Сопоставить selectedTradeIds со строками, отображаемыми для выбранной валютной пары." }),
          Object.freeze({ boundary: "Браузер", title: "Оставить только допустимые Trades.", detail: "Исключить синтетические строки; потребовать положительный Trade ID, сторону BUY или SELL и положительный Transfer Rate." }),
          Object.freeze({ boundary: "Браузер", title: "Создать снимок исходных Trades.", detail: "Скопировать подходящие строки Position в sourceDeals для следующего этапа. Состояние флажков остаётся только в браузере." })
        ]),
        controls: Object.freeze([
          Object.freeze({ check: "После фильтрации должен остаться хотя бы один допустимый Trade.", failure: "Показать предупреждение и остановить процесс до отправки запроса." }),
          Object.freeze({ check: "Каждая выбранная строка должна содержать минимальные данные, необходимые интерфейсу Batching.", failure: "Пропустить недопустимую строку; Position и база данных остаются без изменений." })
        ]),
        artifacts: Object.freeze([
          Object.freeze({ kind: "Вход", name: "selectedTradeIds: Set", scope: "Браузер", purpose: "Изменяемый набор флажков, которым управляет Position." }),
          Object.freeze({ kind: "В процессе", name: "sourceDeals: PositionRow[]", scope: "Браузер", purpose: "Допустимые исходные строки, зафиксированные из текущего отображения." }),
          Object.freeze({ kind: "Выход", name: "eligible source snapshot", scope: "Процесс Manual Batching", purpose: "Зафиксированный набор допустимых Trades для дальнейшей обработки." })
        ]),
        traceability: Object.freeze([
          Object.freeze({ label: "Хранение", value: "Не сохраняется. Выбор флажками существует только в памяти браузера." }),
          Object.freeze({ label: "Аудит", value: "На этом этапе запись аудита не создаётся." }),
          Object.freeze({ label: "Журнал приложения", value: "Событие этапа не создаётся; может измениться только пользовательское предупреждение или статус." })
        ]),
        result: "Сформирован снимок допустимых Trades, зафиксированный из текущего состояния Position."
      }),
      tenor: Object.freeze({
        theme: "is-tenor",
        icon: "alt_route",
        kicker: "02 · Решение",
        title: "Разрешить Batching Key",
        objective: "Выделить из смешанной выборки один набор Trades с общим Batching Key для одного Batch.",
        steps: Object.freeze([
          Object.freeze({ boundary: "Браузер", title: "Сгруппировать по полному Batching Key.", detail: "Учесть Ccy Pair, точность валют, Trade Date, Tenor и обе Value Dates; сохранить допустимые Trades каждой группы." }),
          Object.freeze({ boundary: "Браузер", title: "Выбрать одну совместимую группу.", detail: "Единый Batching Key продолжается напрямую. Для смешанной выборки дилер выбирает одну группу; браузер не создаёт независимые Batches для остальных групп." }),
          Object.freeze({ boundary: "Браузер", title: "Подготовить неизменяемую идентичность запроса.", detail: "Отсортировать числовые tradeIds и создать один idempotencyKey для точного набора." }),
          Object.freeze({ boundary: "API", title: "Отправить команду процесса «Ручной Batching».", detail: "Передать tradeIds запросом POST в /api/v1/batches, указав idempotencyKey в заголовке." })
        ]),
        controls: Object.freeze([
          Object.freeze({ check: "Нейтрализация техническими FX Swap ещё не реализована, поэтому Cross-Tenor Batching остаётся отключён.", failure: "Смешанный Batching Key нельзя отправить как один Batch; требуется решение пользователя." }),
          Object.freeze({ check: "Выбранная группа Batching Key должна содержать хотя бы один допустимый исходный Trade.", failure: "Не отправлять пустую совместимую группу." })
        ]),
        artifacts: Object.freeze([
          Object.freeze({ kind: "Вход", name: "sourceDeals: PositionRow[]", scope: "Браузер", purpose: "Набор допустимых Trades, полученный с этапа 01." }),
          Object.freeze({ kind: "В процессе", name: "compatibilityGroups: Map<BatchingKey, Trade[]>", scope: "Браузер", purpose: "Модель выбора для смешанной выборки Batching Key." }),
          Object.freeze({ kind: "Выход", name: "tradeIds: number[]", scope: "Команда API", purpose: "Отсортированные Trade ID, отправляемые серверу." }),
          Object.freeze({ kind: "Выход", name: "idempotencyKey: UUID", scope: "Заголовок запроса", purpose: "Стабильная идентичность, повторно используемая для точного повтора запроса." })
        ]),
        traceability: Object.freeze([
          Object.freeze({ label: "Хранение", value: "До начала серверной транзакции на этапе 03 долговременная запись не выполняется." }),
          Object.freeze({ label: "Аудит", value: "Точный набор Trade будет записан как состав Batch, если транзакция завершится успешно." }),
          Object.freeze({ label: "Журнал приложения", value: "Выбор в диалоговом окне отдельным событием не регистрируется." })
        ]),
        result: "Один совместимый набор с отсортированными Trade ID и стабильным ключом идемпотентности."
      }),
      validate: Object.freeze({
        theme: "is-validation",
        icon: "fact_check",
        kicker: "03 · Контроль",
        title: "Проверить команду и выборку",
        objective: "Проверить команду и заново построить по данным БД одну актуальную допустимую выборку Trades внутри одной транзакции.",
        steps: Object.freeze([
          Object.freeze({ boundary: "Приложение", title: "Нормализовать команду.", detail: "Потребовать корректный idempotency key и от 1 до 200 уникальных положительных Trade ID; затем отсортировать ID." }),
          Object.freeze({ boundary: "БД", title: "Найти существующий Batch по ключу идемпотентности.", detail: "Повторно вернуть совпадающий Batch либо отклонить использование ключа с другими Trade ID или другой причиной формирования." }),
          Object.freeze({ boundary: "БД", title: "Заново построить актуальную серверную выборку.", detail: "Загрузить полные актуальные данные Trade для каждого запрошенного ID; отклонить отсутствующие, недоступные, уже включённые в Batch и неподдерживаемые технические Trades." }),
          Object.freeze({ boundary: "Домен", title: "Проверить полный Batching Key.", detail: "Потребовать одну валютную пару, Trade Date, Tenor, обе Value Dates и совместимую точность валют для всей выборки." })
        ]),
        controls: Object.freeze([
          Object.freeze({ check: "Ключ идемпотентности, причина формирования и отсортированные Trade ID должны совпадать с предыдущим Batch.", failure: "Для точного повтора вернуть прежний Batch; конфликтующую команду отклонить." }),
          Object.freeze({ check: "Каждый запрошенный Trade должен быть актуально допустим и содержать корректные базовые данные, включая Side, Tenor и Transfer Rate.", failure: "Прервать обработку до сохранения; Batch не становится постоянным." }),
          Object.freeze({ check: "На этапе 04 единая выборка и её Batching Key повторно проверяются на границе домена.", failure: "Доменная ошибка откатывает транзакцию целиком." })
        ]),
        artifacts: Object.freeze([
          Object.freeze({ kind: "Вход", name: "{ idempotencyKey, tradeIds }", scope: "Приложение", purpose: "Команда процесса «Ручной Batching», полученная от API." }),
          Object.freeze({ kind: "В процессе", name: "normalized", scope: "Приложение", purpose: "Каноническая команда с отсортированными Trade ID." }),
          Object.freeze({ kind: "Выход", name: "sourceTrades[]", scope: "Этап 04", purpose: "Одна полная актуальная выборка для одного Batch." })
        ]),
        traceability: Object.freeze([
          Object.freeze({ label: "Хранение", value: "Постоянная запись не появляется до сохранения агрегата Batch на этапе 05." }),
          Object.freeze({ label: "Аудит", value: "batches хранит публичный idempotency key, а batch_members — точный набор исходных Trade." }),
          Object.freeze({ label: "Журнал приложения", value: "События отдельных проверок и попыток повтора не создаются." })
        ]),
        result: "Одна проверенная актуальная серверная выборка Trades готова к формированию Batch."
      }),
      form: Object.freeze({
        theme: "is-domain",
        icon: "calculate",
        kicker: "04 · Домен",
        title: "Сформировать и нейтрализовать",
        objective: "Сформировать одну модель Batch с нулевой позицией в Base Currency и нейтральным cash в Quote Currency.",
        steps: Object.freeze([
          Object.freeze({ boundary: "Приложение", title: "Передать в домен проверенную исходную выборку.", detail: "Использовать актуальные записи, восстановленные на этапе 03, без повторного чтения базы данных." }),
          Object.freeze({ boundary: "Домен", title: "Повторно проверить группу и её Batching Key.", detail: "Повторить проверку каждого исходного инварианта и потребовать одну валютную пару, Trade Date, Tenor, обе Value Dates, точность валют, положительные суммы и положительные Transfer Rate." }),
          Object.freeze({ boundary: "Домен", title: "Рассчитать вклад исходных Trades в баланс.", detail: "Вычислить знаковые балансы в Base Currency и Quote Currency, а также точные суммы в Quote Currency по Transfer Rate в minor units." }),
          Object.freeze({ boundary: "Домен", title: "Нейтрализовать ненулевую позицию в Base Currency.", detail: "По стороне, создавшей дисбаланс, рассчитать взвешенный по Base Currency Transfer Rate и создать противоположный Balance Trade и зеркальный Position Out." }),
          Object.freeze({ boundary: "Домен", title: "Нейтрализовать cash в Quote Currency.", detail: "Создать Quote Cash Out, противоположный оставшемуся балансу в Quote Currency. Выход создаётся даже при плоском или нулевом cash-результате." })
        ]),
        controls: Object.freeze([
          Object.freeze({ check: "Все участники должны иметь один Batching Key и актуальную точность валют.", failure: "Отклонить группу и полностью откатить ручную операцию." }),
          Object.freeze({ check: "Каждая исходная сумма Trade должна помещаться в безопасный диапазон minor units и иметь положительный Transfer Rate.", failure: "Отклонить операцию до перевода Batch в статус FORMED." }),
          Object.freeze({ check: "Участники Batch вместе с Balance Trade должны дать ОВП в Base Currency, равную 0; Quote Cash Out должен привести cash в Quote Currency к 0.", failure: "Защитные ограничения формирования в БД не позволят пометить Batch как FORMED." })
        ]),
        artifacts: Object.freeze([
          Object.freeze({ kind: "Вход", name: "sourceTrades[]", scope: "Домен", purpose: "Полный совместимый набор Trades, включаемых в один Batch." }),
          Object.freeze({ kind: "В процессе", name: "netBaseCcyAmountMinor", scope: "Домен", purpose: "Знаковая позиция исходных Trades в Base Currency." }),
          Object.freeze({ kind: "В процессе", name: "netQuoteCcyAmountMinor", scope: "Домен", purpose: "Знаковый вклад исходных Trades в cash в Quote Currency." }),
          Object.freeze({ kind: "Выход", name: "formation.balanceTrade?", scope: "Этап 05", purpose: "Необязательный участник, создаваемый только при ненулевой позиции в Base Currency." }),
          Object.freeze({ kind: "Выход", name: "formation.positionOut?", scope: "Этап 05", purpose: "Необязательный выход, зеркальный Balance Trade при ненулевой позиции в Base Currency." }),
          Object.freeze({ kind: "Выход", name: "formation.quoteCashOut", scope: "Этап 05", purpose: "Обязательный Quote cash output, включая возможную нулевую сумму." })
        ]),
        traceability: Object.freeze([
          Object.freeze({ label: "Хранение", value: "Модель формирования рассчитывается в памяти; репозиторий вставляет её записи до фиксации внешней транзакции." }),
          Object.freeze({ label: "Аудит", value: "Batch получает причину формирования MANUAL_SELECTION и selectedTradeCount." }),
          Object.freeze({ label: "Журнал приложения", value: "Промежуточные net-балансы и отдельные доменные решения как события этапа не публикуются." })
        ]),
        result: "Нейтральная модель формирования с исходными участниками, необязательными техническими Trades и обязательным Quote Cash Out."
      }),
      commit: Object.freeze({
        theme: "is-commit",
        icon: "database",
        kicker: "05 · Фиксация",
        title: "Зафиксировать и обновить",
        objective: "Атомарно сохранить один Batch и обновить Position оператора.",
        steps: Object.freeze([
          Object.freeze({ boundary: "БД", title: "Сохранить агрегат Batch.", detail: "Вставить batches, всех участников, необязательные расширения технических Trade и обязательный Quote Cash Out; затем перевести Batch в FORMED." }),
          Object.freeze({ boundary: "БД", title: "Зафиксировать одну транзакцию агрегата.", detail: "Выполнить commit только после прохождения всех проверок целостности полного Batch." }),
          Object.freeze({ boundary: "API", title: "Вернуть сформированный Batch.", detail: "Ответить одиночным batchId, данными формирования и признаком replayed." }),
          Object.freeze({ boundary: "Браузер", title: "Обновить Position после успеха.", detail: "Повторно загрузить Position из БД, убрать из UI-выделения только отправленные строки и отрисовать обновлённую позицию." })
        ]),
        controls: Object.freeze([
          Object.freeze({ check: "Полный агрегат Batch должен достичь статуса FORMED до commit.", failure: "Ошибка серверной транзакции откатывает агрегат; данные Position не изменяются." }),
          Object.freeze({ check: "HTTP-ответ должен быть получен, а повторная загрузка Position — завершиться успешно.", failure: "Если обновление UI завершится ошибкой уже после фиксации транзакции, Batch останется сформированным в БД, а интерфейс будет показывать ошибку до перезагрузки." })
        ]),
        artifacts: Object.freeze([
          Object.freeze({ kind: "Вход", name: "formation + sourceTrades[]", scope: "Репозиторий", purpose: "Полный результат единственного Batch." }),
          Object.freeze({ kind: "Выход", name: "batches / members / outputs", scope: "База данных", purpose: "Постоянные записи агрегата Batch, его состава и выходов." }),
          Object.freeze({ kind: "Выход", name: "{ batchId, replayed, ...batch }", scope: "Ответ API", purpose: "Результат одного Batch, возвращаемый браузеру." }),
          Object.freeze({ kind: "Выход", name: "refreshed positions", scope: "Браузер", purpose: "Position без участников сформированного Batch и с видимым Position Out, если он существует." })
        ]),
        traceability: Object.freeze([
          Object.freeze({ label: "Хранение", value: "batches, batch_members, trade_exposures и специализированные технические записи фиксируются совместно." }),
          Object.freeze({ label: "Аудит", value: "Публичный idempotency key, неизменяемый состав, причина и детали Batch, а также v_batch_formation_audit обеспечивают долговременную трассируемость." }),
          Object.freeze({ label: "Журнал приложения", value: "Отдельного журнала успеха или ошибки для каждого этапа процесса и обновления UI нет." })
        ]),
        result: "Сформированный и сохранённый Batch, а также обновлённая Position; точный повтор возвращает тот же результат."
      })
    });
    const MANUAL_BATCH_PROCESS_THEMES = Object.freeze([
      "is-input",
      "is-tenor",
      "is-validation",
      "is-domain",
      "is-commit"
    ]);
    let pinnedManualBatchProcessStage = "select";

    function processCatalogStages() {
      return processCatalogLanguage === "ru"
        ? MANUAL_BATCH_PROCESS_STAGES_RU
        : MANUAL_BATCH_PROCESS_STAGES;
    }

    function updateProcessCatalogDocumentTitle() {
      if (processesPage && !processesPage.hidden) {
        if (isDomainGlossaryRoute()) {
          document.title = processCatalogLanguage === "ru"
            ? "Domain Glossary — Каталог процессов"
            : "Domain Glossary - Process Catalog";
        } else {
          document.title = processCatalogLanguage === "ru"
            ? "Ручной Batching — Каталог процессов"
            : "Manual Batching - Process Catalog";
        }
      }
    }

    function renderProcessCatalogRoute() {
      const isGlossary = isDomainGlossaryRoute();
      const activeView = isGlossary ? "glossary" : "manual";

      if (manualBatchFormationProcessView) {
        manualBatchFormationProcessView.hidden = isGlossary;
      }
      if (domainGlossaryProcessView) {
        domainGlossaryProcessView.hidden = !isGlossary;
      }
      processCatalogViewLinks.forEach(link => {
        const view = link.dataset.processCatalogView;
        const isActive = view === activeView;
        link.classList.toggle("is-active", isActive);
        if (isActive) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      });
      updateProcessCatalogDocumentTitle();

      const termKey = domainGlossaryTermFromRoute();
      if (isGlossary && termKey) {
        window.requestAnimationFrame(() => showManualProcessDefinition(termKey));
      }
    }

    function setProcessCatalogLanguage(language, { persist = true } = {}) {
      processCatalogLanguage = language === "en" ? "en" : "ru";
      const copy = PROCESS_CATALOG_COPY[processCatalogLanguage];
      const ariaCopy = PROCESS_CATALOG_COPY.aria[processCatalogLanguage];

      processCatalogCopyElements.forEach(element => {
        const key = element.dataset.processCopy;
        if (Object.prototype.hasOwnProperty.call(copy, key)) {
          if (element.hasAttribute("data-process-linked-copy")) {
            setManualProcessLinkedText(element, copy[key]);
          } else {
            element.textContent = copy[key];
          }
        }
      });
      linkDomainGlossaryDefinitions();
      processCatalogAriaElements.forEach(element => {
        const key = element.dataset.processAriaLabel;
        if (Object.prototype.hasOwnProperty.call(ariaCopy, key)) {
          element.setAttribute("aria-label", ariaCopy[key]);
        }
      });
      processCatalogLanguageButtons.forEach(button => {
        const isActive = button.dataset.processLanguage === processCatalogLanguage;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
      if (processesPage) {
        processesPage.setAttribute("lang", processCatalogLanguage);
      }
      if (persist) {
        try {
          window.localStorage.setItem(PROCESS_CATALOG_LANGUAGE_STORAGE_KEY, processCatalogLanguage);
        } catch (_error) {}
      }
      renderManualBatchProcessInspector(pinnedManualBatchProcessStage);
      renderProcessCatalogRoute();
    }

    function replaceManualProcessDetailRows(container, rows, createRow) {
      container.replaceChildren(...rows.map(createRow));
    }

    const MANUAL_PROCESS_TERM_REFERENCES = Object.freeze([
      Object.freeze({ text: "Position Management — Auto Mode", key: "auto-position-management-mode" }),
      Object.freeze({ text: "Position Management — Manual Mode", key: "manual-position-management-mode" }),
      Object.freeze({ text: "Auto Mode of Position Management", key: "auto-position-management-mode" }),
      Object.freeze({ text: "Manual Mode of Position Management", key: "manual-position-management-mode" }),
      Object.freeze({ text: "Trade Context Admission Mode", key: "trade-context-admission-mode" }),
      Object.freeze({ text: "Auto Mode Eligibility", key: "auto-mode-eligibility" }),
      Object.freeze({ text: "Auto Management Admission", key: "auto-management-admission" }),
      Object.freeze({ text: "Position Management Mode", key: "position-management-mode" }),
      Object.freeze({ text: "Manual Management", key: "manual-position-management-mode" }),
      Object.freeze({ text: "Auto Management", key: "auto-position-management-mode" }),
      Object.freeze({ text: "Eligibility Checks", key: "eligibility-check" }),
      Object.freeze({ text: "Eligibility Check", key: "eligibility-check" }),
      Object.freeze({ text: "Admission State", key: "admission-state" }),
      Object.freeze({ text: "Ccy Pair", key: "ccy-pair" }),
      Object.freeze({ text: "Auto Hedging", key: "auto-hedging" }),
      Object.freeze({ text: "Servicing Location", key: "servicing-location" }),
      Object.freeze({ text: "Accounting System", key: "accounting-system" }),
      Object.freeze({ text: "Trade Context", key: "trade-context" }),
      Object.freeze({ text: "Originating System", key: "originating-system" }),
      Object.freeze({ text: "Pricing Mode", key: "pricing-mode" }),
      Object.freeze({ text: "Market Pulse", key: "market-pulse" }),
      Object.freeze({ text: "Cross-Tenor Batching", key: "cross-tenor-batching" }),
      Object.freeze({ text: "Batch Internal Swaps", key: "batch-internal-swap" }),
      Object.freeze({ text: "Batch Internal Swap", key: "batch-internal-swap" }),
      Object.freeze({ text: "Batches", key: "batch" }),
      Object.freeze({ text: "Client Deals", key: "client-deal" }),
      Object.freeze({ text: "Hedge Deals", key: "hedge-deal" }),
      Object.freeze({ text: "Position", key: "position" }),
      Object.freeze({ text: "Transfer Rate", key: "transfer-rate" }),
      Object.freeze({ text: "Batching Key", key: "batching-key" }),
      Object.freeze({ text: "Base Currency", key: "base-currency" }),
      Object.freeze({ text: "Quote Currency", key: "quote-currency" }),
      Object.freeze({ text: "Trade Date", key: "trade-date" }),
      Object.freeze({ text: "Value Dates", key: "value-date" }),
      Object.freeze({ text: "Trades", key: "trade" }),
      Object.freeze({ text: "Trade", key: "trade" }),
      Object.freeze({ text: "Client Deal", key: "client-deal" }),
      Object.freeze({ text: "Hedge Deal", key: "hedge-deal" }),
      Object.freeze({ text: "Value Date", key: "value-date" }),
      Object.freeze({ text: "Batch", key: "batch" }),
      Object.freeze({ text: "Batching", key: "batching" }),
      Object.freeze({ text: "Tenors", key: "tenor" }),
      Object.freeze({ text: "Tenor", key: "tenor" })
    ]);

    function isManualProcessTermWordCharacter(value) {
      return Boolean(value) && /[0-9A-Za-zА-Яа-яЁё_]/.test(value);
    }

    function isManualProcessTermBoundary(value, index, length) {
      return !isManualProcessTermWordCharacter(value[index - 1])
        && !isManualProcessTermWordCharacter(value[index + length]);
    }

    function isManualProcessQuotedLabel(value, index, length) {
      const openingQuote = value[index - 1];
      const closingQuote = value[index + length];
      return (openingQuote === "“" && closingQuote === "”")
        || (openingQuote === "«" && closingQuote === "»")
        || (openingQuote === '"' && closingQuote === '"');
    }

    function nextManualProcessTermReference(value, fromIndex, excludeTermKey = "") {
      let nextReference = null;
      const normalizedValue = value.toLocaleLowerCase();

      MANUAL_PROCESS_TERM_REFERENCES.forEach(term => {
        if (term.key === excludeTermKey) {
          return;
        }
        const normalizedTerm = term.text.toLocaleLowerCase();
        let index = normalizedValue.indexOf(normalizedTerm, fromIndex);
        while (
          index >= 0
          && (
            !isManualProcessTermBoundary(value, index, term.text.length)
            || isManualProcessQuotedLabel(value, index, term.text.length)
          )
        ) {
          index = normalizedValue.indexOf(normalizedTerm, index + 1);
        }
        if (index < 0) {
          return;
        }
        if (
          !nextReference
          || index < nextReference.index
          || (index === nextReference.index && term.text.length > nextReference.term.text.length)
        ) {
          nextReference = { index, term };
        }
      });

      return nextReference;
    }

    function manualProcessArtifactTargetId(stageKey, artifactIndex) {
      return `manual-process-artifact-${stageKey}-${artifactIndex + 1}`;
    }

    function manualProcessArtifactReferences(stageKey, artifacts) {
      const seenKeys = new Set();

      return artifacts.flatMap((artifact, artifactIndex) => {
        const name = String(artifact.name || "").trim();
        const typeSeparatorIndex = name.indexOf(":");
        const primaryName = (typeSeparatorIndex >= 0
          ? name.slice(0, typeSeparatorIndex)
          : name).trim();
        const candidates = primaryName.startsWith("{") && primaryName.endsWith("}")
          ? primaryName.slice(1, -1).split(",")
          : primaryName.split(/\s+(?:\+|\/)\s+/);

        return candidates.flatMap(candidate => {
          const key = candidate.trim().replace(/(?:\[\]|\?)$/, "");
          const normalizedKey = key.toLocaleLowerCase();
          if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(key) || seenKeys.has(normalizedKey)) {
            return [];
          }
          seenKeys.add(normalizedKey);
          return [{
            text: key,
            key,
            targetId: manualProcessArtifactTargetId(stageKey, artifactIndex)
          }];
        });
      });
    }

    function nextManualProcessArtifactReference(value, fromIndex, artifactReferences) {
      let nextReference = null;
      const normalizedValue = value.toLocaleLowerCase();

      artifactReferences.forEach(artifact => {
        const normalizedArtifact = artifact.text.toLocaleLowerCase();
        let index = normalizedValue.indexOf(normalizedArtifact, fromIndex);
        while (
          index >= 0
          && !isManualProcessTermBoundary(value, index, artifact.text.length)
        ) {
          index = normalizedValue.indexOf(normalizedArtifact, index + 1);
        }
        if (index < 0) {
          return;
        }
        if (
          !nextReference
          || index < nextReference.index
          || (index === nextReference.index && artifact.text.length > nextReference.artifact.text.length)
        ) {
          nextReference = { index, artifact };
        }
      });

      return nextReference;
    }

    function setManualProcessLinkedText(
      element,
      value,
      { excludeTermKey = "", artifactReferences = [] } = {}
    ) {
      const text = String(value ?? "");
      const content = [];
      let cursor = 0;

      while (cursor < text.length) {
        const termReference = nextManualProcessTermReference(text, cursor, excludeTermKey);
        const artifactReference = nextManualProcessArtifactReference(
          text,
          cursor,
          artifactReferences
        );
        const reference = artifactReference && (
          !termReference
          || artifactReference.index < termReference.index
          || (
            artifactReference.index === termReference.index
            && artifactReference.artifact.text.length > termReference.term.text.length
          )
        )
          ? { index: artifactReference.index, kind: "artifact", value: artifactReference.artifact }
          : termReference
            ? { index: termReference.index, kind: "term", value: termReference.term }
            : null;
        if (!reference) {
          content.push(document.createTextNode(text.slice(cursor)));
          break;
        }

        if (reference.index > cursor) {
          content.push(document.createTextNode(text.slice(cursor, reference.index)));
        }

        const link = document.createElement("a");
        const referenceLength = reference.value.text.length;
        if (reference.kind === "artifact") {
          link.className = "manual-process-artifact-link";
          link.href = manualBatchFormationProcessRoute();
          link.dataset.processArtifactReference = reference.value.key;
          link.addEventListener("click", event => {
            event.preventDefault();
            showManualProcessArtifact(reference.value.targetId);
          });
        } else {
          link.className = "manual-process-term-link";
          link.href = domainGlossaryRoute(reference.value.key);
          link.dataset.processTermReference = reference.value.key;
        }
        link.textContent = text.slice(reference.index, reference.index + referenceLength);
        content.push(link);
        cursor = reference.index + referenceLength;
      }

      element.replaceChildren(...content);
    }

    function linkDomainGlossaryDefinitions() {
      document.querySelectorAll(".manual-process-definition[id^='process-term-']")
        .forEach(definition => {
          const description = definition.querySelector("dd[data-process-copy]");
          if (!description) {
            return;
          }
          const termKey = definition.id.slice("process-term-".length);
          const allowSelfReference = termKey === "batching" || termKey === "value-date";
          const excludeTermKey = allowSelfReference ? "" : termKey;
          setManualProcessLinkedText(
            description,
            description.textContent,
            { excludeTermKey }
          );
        });
    }

    let manualProcessDefinitionHighlightTimeoutId = null;
    let manualProcessArtifactHighlightTimeoutId = null;

    function showManualProcessDefinition(termKey) {
      const definition = document.getElementById(`process-term-${termKey}`);
      if (!definition) {
        return;
      }

      document.querySelectorAll(".manual-process-definition.is-referenced")
        .forEach(item => item.classList.remove("is-referenced"));
      definition.classList.add("is-referenced");
      definition.scrollIntoView({ behavior: "smooth", block: "nearest" });
      definition.focus({ preventScroll: true });

      window.clearTimeout(manualProcessDefinitionHighlightTimeoutId);
      manualProcessDefinitionHighlightTimeoutId = window.setTimeout(() => {
        definition.classList.remove("is-referenced");
      }, 1800);
    }

    function showManualProcessArtifact(targetId) {
      const row = document.getElementById(targetId);
      if (!row) {
        return;
      }

      manualProcessInspectorArtifacts
        .querySelectorAll(".manual-process-artifact-row.is-referenced")
        .forEach(item => item.classList.remove("is-referenced"));
      row.classList.add("is-referenced");
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      row.focus({ preventScroll: true });

      window.clearTimeout(manualProcessArtifactHighlightTimeoutId);
      manualProcessArtifactHighlightTimeoutId = window.setTimeout(() => {
        row.classList.remove("is-referenced");
      }, 1800);
    }

    function renderManualBatchProcessInspector(stageKey, { pinned = false } = {}) {
      const stage = processCatalogStages()[stageKey];

      if (!stage || !manualProcessInspector) {
        return;
      }

      manualProcessInspector.classList.remove(...MANUAL_BATCH_PROCESS_THEMES);
      manualProcessInspector.classList.add(stage.theme);
      manualProcessInspectorIcon.textContent = stage.icon;
      manualProcessInspectorKicker.textContent = stage.kicker;
      const artifactReferences = manualProcessArtifactReferences(stageKey, stage.artifacts);
      const linkedTextOptions = { artifactReferences };
      setManualProcessLinkedText(manualProcessInspectorTitle, stage.title, linkedTextOptions);
      setManualProcessLinkedText(manualProcessInspectorObjective, stage.objective, linkedTextOptions);
      replaceManualProcessDetailRows(
        manualProcessInspectorSteps,
        stage.steps,
        (step, index) => {
          const item = document.createElement("li");
          item.className = "manual-process-step";
          const number = document.createElement("span");
          number.className = "manual-process-step-number";
          number.textContent = `${stage.kicker.slice(0, 2)}.${index + 1}`;
          const boundary = document.createElement("span");
          boundary.className = "manual-process-boundary";
          boundary.textContent = step.boundary;
          const copy = document.createElement("span");
          copy.className = "manual-process-step-copy";
          const title = document.createElement("strong");
          setManualProcessLinkedText(title, step.title, linkedTextOptions);
          const detail = document.createElement("span");
          setManualProcessLinkedText(detail, step.detail, linkedTextOptions);
          copy.append(title, detail);
          item.append(number, boundary, copy);
          return item;
        }
      );
      replaceManualProcessDetailRows(
        manualProcessInspectorControls,
        stage.controls,
        control => {
          const item = document.createElement("li");
          item.className = "manual-process-control";
          const check = document.createElement("strong");
          setManualProcessLinkedText(check, control.check, linkedTextOptions);
          const outcome = document.createElement("span");
          outcome.className = "manual-process-control-outcome";
          const icon = document.createElement("span");
          icon.className = "button-icon";
          icon.setAttribute("aria-hidden", "true");
          icon.textContent = "error";
          const failure = document.createElement("span");
          setManualProcessLinkedText(failure, control.failure, linkedTextOptions);
          outcome.append(icon, failure);
          item.append(check, outcome);
          return item;
        }
      );
      replaceManualProcessDetailRows(
        manualProcessInspectorArtifacts,
        stage.artifacts,
        (artifact, artifactIndex) => {
          const row = document.createElement("tr");
          row.className = "manual-process-artifact-row";
          row.id = manualProcessArtifactTargetId(stageKey, artifactIndex);
          row.tabIndex = -1;
          const kind = document.createElement("td");
          kind.className = "manual-process-artifact-kind";
          kind.textContent = artifact.kind;
          const name = document.createElement("td");
          const code = document.createElement("code");
          code.textContent = artifact.name;
          name.append(code);
          const scope = document.createElement("td");
          scope.textContent = artifact.scope;
          const purpose = document.createElement("td");
          setManualProcessLinkedText(purpose, artifact.purpose);
          row.append(kind, name, scope, purpose);
          return row;
        }
      );
      replaceManualProcessDetailRows(
        manualProcessInspectorTraceability,
        stage.traceability,
        trace => {
          const row = document.createElement("div");
          row.className = "manual-process-traceability-row";
          const label = document.createElement("dt");
          label.textContent = trace.label;
          const value = document.createElement("dd");
          setManualProcessLinkedText(value, trace.value, linkedTextOptions);
          row.append(label, value);
          return row;
        }
      );
      setManualProcessLinkedText(manualProcessInspectorResult, stage.result, linkedTextOptions);

      manualProcessNodes.forEach(node => {
        const isCurrent = node.dataset.manualProcessStage === stageKey;
        const isPinned = node.dataset.manualProcessStage === pinnedManualBatchProcessStage;
        node.classList.toggle("is-current", isCurrent);
        node.classList.toggle("is-pinned", isPinned);
        node.setAttribute("aria-pressed", String(isPinned));
      });

      if (pinned) {
        pinnedManualBatchProcessStage = stageKey;
        manualProcessNodes.forEach(node => {
          const isPinned = node.dataset.manualProcessStage === stageKey;
          node.classList.toggle("is-pinned", isPinned);
          node.setAttribute("aria-pressed", String(isPinned));
        });
      }
    }

    manualProcessNodes.forEach(node => {
      const stageKey = node.dataset.manualProcessStage;

      node.addEventListener("click", () => {
        renderManualBatchProcessInspector(stageKey, { pinned: true });
      });
    });

    processCatalogLanguageButtons.forEach(button => {
      button.addEventListener("click", () => {
        setProcessCatalogLanguage(button.dataset.processLanguage);
        renderWorkspacePageHeading();
      });
    });

    setProcessCatalogLanguage(processCatalogLanguage, { persist: false });
