# 13 — Interactive chart and dashboard system

## Chart schema
`chartType`, source references (dataset/output), mappings x/y/group/value, aggregation, sort, filter selection, labels, units, legend, style tokens. Persist declarative chart config, not ECharts instance or computed pixels. Adapter maps validated data to ECharts options; never accept arbitrary callback code or unsafe HTML tooltip. Source update triggers reactive rerender using dataset/graph revision. Dispose charts on unmount; ResizeObserver with debounce, responsive and theme-aware. Lazy load renderer. Provide data table/summary alternative and ARIA accessibility; no reliance on color alone.

| Type | Constraints |
|---|---|
| Bar / horizontal bar | categorical x; numeric y; zero baseline by default |
| Line | ordered numeric/date x; explicit missing gaps, no hidden interpolation |
| Scatter | numeric x,y; paired valid n, optional regression line |
| Histogram | bins computed by statistics engine; show counts/edges |
| Pie / donut | nonnegative parts, sum>0, same unit/currency, max categories warning |
| Box plot | Q1/median/Q3 and documented whiskers; outliers separate |
| Time series | explicit timezone/date handling, sorted snapshots |

Chart builder select source → type → mapping → preview → save. Validate incompatible types and missing values before display. Grouping aggregate sum/mean/count only explicit; show whether filtered. Tooltips include full values and units; legends keyboard accessible where supported, alternative controls. Mobile pinch/zoom optional not required; touch tooltip, sensible font and scroll. For large scatter series, downsample for display only with label; computations use full data; no silent loss. Export PNG if renderer supports, CSV underlying values, Markdown summary. Chart error does not crash page; missing ref recovery link.

## Dashboard
Blocks can be arranged in responsive 1/2-column dashboard view later; rank remains canonical and mobile stacks. KPI block references typed output, shows provenance and stale status. Finance donut cannot represent negative liabilities; use assets-only with label and separate liability bars or net KPI. Mixed currencies converted before aggregation per rate snapshot. Test chart data arrays/labels rather than only screenshots; actual renderer smoke tests for resize, dark theme, empty/negative/pairwise cases, source update, cleanup, and accessible summary.
