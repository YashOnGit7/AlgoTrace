// Purpose: uses proptest to check engine invariants across generated daily price paths.
// Connects: randomized valid OHLC data to panic safety, integer shares, cash, and trade sequencing.

mod common;

use algotrace_engine::costs::load_cost_preset;
use algotrace_engine::evaluator::StrategyParameters;
use algotrace_engine::simulator::{run_backtest, simulate_into, SimulationWorkspace};
use algotrace_engine::types::StrategyConfig;
use proptest::prelude::*;
use proptest::test_runner::TestRunner;

/// Checks random valid price paths finish without panicking and retain portfolio invariants.
///
/// Example: a generated list of positive closes becomes valid bars with one-unit high/low padding.
#[test]
fn random_valid_price_data_never_panics_or_breaks_portfolio_invariants() {
    let mut runner = TestRunner::default();
    runner
        .run(&prop::collection::vec(20.0_f64..500.0, 8..64), |closes| {
            let rows: Vec<[f64; 6]> = closes
                .iter()
                .enumerate()
                .map(|(index, close)| {
                    let open = *close;
                    [
                        index as f64 + 1.0,
                        open,
                        close + 1.0,
                        close - 1.0,
                        *close,
                        100.0,
                    ]
                })
                .collect();
            let bytes = common::encode_rows(&rows);
            let prices = common::price_view(&bytes);
            let ast =
                common::crossover_ast(0.0, load_cost_preset("zerodha_equity_delivery").unwrap());
            let result = run_backtest(&ast, prices);
            prop_assert!(result.is_ok());
            let config = StrategyConfig {
                initial_capital: 100_000.0,
                slippage_pct: 0.0,
                cost_preset: load_cost_preset("zerodha_equity_delivery").unwrap(),
                force_close_at_end: false,
                risk_free_rate: 0.06,
                trading_days_per_year: 252,
            };
            let mut entries = vec![false; closes.len()];
            let mut exits = vec![false; closes.len()];
            for entry_bar in (0..closes.len()).step_by(4) {
                entries[entry_bar] = true;
                if let Some(exit_signal) = exits.get_mut(entry_bar + 2) {
                    *exit_signal = true;
                }
            }
            let mut workspace = SimulationWorkspace::default();
            simulate_into(
                prices,
                &entries,
                &exits,
                &config,
                StrategyParameters {
                    position_size_pct: 100.0,
                    stop_loss_pct: None,
                    take_profit_pct: None,
                },
                &mut workspace,
            )
            .unwrap();
            let result = workspace.result();
            prop_assert!(result
                .equity_curve
                .iter()
                .all(|point| point.cash >= -1.0e-9));
            prop_assert!(result
                .trades
                .iter()
                .all(|trade| (trade.shares as f64).fract() == 0.0));
            for adjacent in result.trades.windows(2) {
                let previous_exit = adjacent[0].exit_bar;
                prop_assert!(previous_exit.is_some());
                prop_assert!(previous_exit.unwrap() < adjacent[1].entry_bar);
            }
            Ok(())
        })
        .unwrap();
}
