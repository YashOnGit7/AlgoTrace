<!-- Purpose: records the minimal backend architecture. Connects: API scope to the no-database project constraint. -->
# 005: FastAPI only, no Redis or PostgreSQL

## Context (plain words)
This is a small local demo and does not need accounts or a database.

## Options considered
- FastAPI for data and AI proxy requests.
- Add Redis, PostgreSQL, and account services.

## Decision
Use FastAPI only. Do not add Redis, PostgreSQL, or accounts.

## Why (beginner level)
Fewer services mean fewer things to install, configure, and explain.

## Trade-offs
There is no persistent user storage or multi-user account system.

## Interview answer (30 seconds)
The brief cuts databases and accounts. FastAPI only serves data and proxies AI, so the demo stays simple and focused on local backtesting.

