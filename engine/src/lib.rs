//! Purpose: exposes the pure-Rust backtesting engine modules.
//! Connects: borrowed price data and a validated Strategy AST to trades, equity, and metrics.

pub mod costs;
pub mod data;
pub mod evaluator;
pub mod indicators;
pub mod metrics;
pub mod simulator;
pub mod sweep;
pub mod types;
