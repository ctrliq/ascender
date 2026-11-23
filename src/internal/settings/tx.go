package settings

import "github.com/jackc/pgx/v5"

// pgxTx keeps the Store independent of the pool type in signatures.
type pgxTx = pgx.Tx
