/** Purpose: defines the five explicitly offline, deterministic assistant answers. Connects: fixed demo sentences to compiler-valid source. */

export interface OfflineExample { readonly id: string; readonly sentence: string; readonly label: string; readonly code: string }

/** Holds exactly five supported local demos; they never call or imply an AI response. @example the crossover sentence returns the checked-in SMA(10)/SMA(30) program. */
export const OFFLINE_EXAMPLES: readonly OfflineExample[] = [
  {
    id: "sma_crossover",
    label: "Moving-average crossover",
    sentence: "Buy when the 10-day average crosses above the 30-day average, and sell when it crosses below.",
    code: `strategy "SMA crossover"\nfast = sma(close, 10)\nslow = sma(close, 30)\nbuy when crosses_above(fast, slow)\nsell when crosses_below(fast, slow)`,
  },
  {
    id: "rsi_oversold_overbought",
    label: "RSI oversold / overbought",
    sentence: "Buy when RSI 14 crosses below 30 and sell when it crosses above 70.",
    code: `strategy "RSI oversold / overbought"\nvalue = rsi(close, 14)\nbuy when crosses_below(value, 30)\nsell when crosses_above(value, 70)`,
  },
  {
    id: "price_above_sma_stop",
    label: "Price above average with stop-loss",
    sentence: "Buy when close is above its 20-day average and use a 10% stop-loss; sell when close falls below the average.",
    code: `strategy "Price above SMA with stop-loss"\naverage = sma(close, 20)\nbuy when close > average\nsell when close < average\nstop_loss 10%`,
  },
  {
    id: "and_or_volume_filter",
    label: "Average and volume filter",
    sentence: "Buy when close is above its 20-day average and volume is above its 20-day average; sell when close is below its average or below today's open.",
    code: `average = sma(close, 20)\nvolume_average = sma(volume, 20)\nstrong = close > average\nactive_volume = volume > volume_average\nbuy when strong and active_volume\nsell when close < average or close < open`,
  },
  {
    id: "ema_volume_filter",
    label: "EMA and quiet-volume filter",
    sentence: "Buy when close is above its 20-day EMA and volume is below its 10-day average; sell when close falls below the EMA or volume rises above its 10-day average.",
    code: `average = ema(close, 20)\nvolume_average = sma(volume, 10)\ntrend = close > average\nquiet = volume < volume_average\nbuy when trend and quiet\nsell when close < average or volume > volume_average`,
  },
];

/** Finds a fixed example using exact sentence text after trimming outer spaces. @example a supported sentence returns its one stored code string. */
export function findOfflineExample(sentence: string): OfflineExample | undefined {
  return OFFLINE_EXAMPLES.find((example) => example.sentence === sentence.trim());
}
