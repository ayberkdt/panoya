# 12 — Statistical analysis engine

## Scope
Pure functions in analytics module, callable from Statistics block. Data selection: dataset ID/revision, columns, filters, missing policy, sample/population setting, units. Display n total, n valid, n missing/invalid, method and assumptions. Never treat missing as 0. Pairwise complete cases for two-column stats; report paired n. Default omit missing with explicit count, optional error on missing. For empty set return insufficient data. No automatic causal conclusions.

| Method | Definition / behavior |
|---|---|
| Count/sum/min/max/range | finite values, compensated sum where practical |
| Mean | sum/n; numerically stable implementation |
| Variance/std | Welford or stable two-pass; sample n−1 default, population n option |
| Median/quantiles | sorted values, linear interpolation type 7: h=(n−1)p |
| IQR | Q3−Q1; optional Tukey outlier flags not deletion |
| Weighted mean | sum(w*x)/sum(w), nonnegative finite weights, sum>0 |
| Pearson r | centered covariance normalized; zero variance undefined |
| Spearman rho | Pearson of average ranks with ties, paired valid rows |
| OLS simple linear regression | slope Sxy/Sxx, intercept meanY−slope*meanX; n≥2, x variance>0 |
| RMSE / MAE | residual diagnostics, explicitly in y unit |
| R² | 1−SSE/SST; undefined if SST=0; no forced clipping |
| Histogram | explicit bins or FD rule 2 IQR/n^(1/3), fallback Sturges, constant data special case |

Regression outputs slope/intercept, n, residual series, predicted line over observed domain, R². Optional confidence intervals and hypothesis tests P2 only with validated algorithms and assumptions, not implied by regression output. Avoid normality claims from histogram. Expose stats result as structured numeric outputs for formula/chart references; computation reproducible from dataset revision. Large jobs use worker; stable sort copies input. Decimal money stats require explicit same currency/conversion; don't sum EUR+TRY without FX. Numeric overflow reported.

## Reference tests
`[1,2,3,4,5]`: n=5, mean=3, median=3, sample variance=2.5, population variance=2, Q1=2,Q3=4,IQR=2; std sqrt(2.5). `[1,2,3]` vs `[2,4,6]`: r=1, slope=2, intercept=0,R²=1. Constant x yields undefined r/slope. `[1,1,3]` ranks `[1.5,1.5,3]`; ties correctly. Histogram counts sum to valid n, final bin inclusive right; define all others left-inclusive/right-exclusive. Test large offset data (1e12+small), missing, n=1, extremes, permutation invariance within tolerance. Independently compare selected fixtures to NumPy/R or analytic results; record actual reference method/version.

## Stats-Lab integration (optional later)
Audit existing library API, license, numerical validation and runtime compatibility before reusing. Do not import whole repo or assume JavaScript compatibility. Port only tested pure algorithms behind adapter; parity fixtures required. Current spec does not rely on external repo access or guarantee integration.
