package keychain

import (
	"context"
	"database/sql"
	"sync"
	"time"

	"golang.org/x/xerrors"

	"cdr.dev/slog"
	"github.com/coder/coder/v2/coderd/database"
	"github.com/coder/quartz"
)

// DBKeychain implements Keychain for callers with access to the database.
type DBKeychain struct {
	db      database.Store
	feature database.CryptoKeyFeature
	clock   quartz.Clock
	logger  slog.Logger

	// The following are initialized by NewDBKeychain.
	cacheMu   sync.RWMutex
	cache     map[int32]database.CryptoKey
	latestKey database.CryptoKey
}

// NewDBKeychain creates a new DBKeychain. It starts a background
// process that periodically refreshes the cache. The context should
// be canceled to stop the background process.
func NewDBKeychain(ctx context.Context, logger slog.Logger, db database.Store, feature database.CryptoKeyFeature, clock quartz.Clock) (*DBKeychain, error) {
	d := &DBKeychain{
		db:      db,
		feature: feature,
		clock:   clock,
		logger:  logger,
	}
	err := d.newCache(ctx)
	if err != nil {
		return nil, xerrors.Errorf("new cache: %w", err)
	}

	go d.refreshCache(ctx)
	return d, nil
}

// Version returns the CryptoKey with the given sequence number, provided that
// it is not deleted or has breached its deletion date.
func (d *DBKeychain) Version(ctx context.Context, sequence int32) (database.CryptoKey, error) {
	now := d.clock.Now().UTC()
	d.cacheMu.RLock()
	key, ok := d.cache[sequence]
	d.cacheMu.RUnlock()
	if ok {
		if key.IsInvalid(now) {
			return database.CryptoKey{}, ErrKeyNotFound
		}
		return key, nil
	}

	d.cacheMu.Lock()
	defer d.cacheMu.Unlock()

	key, ok = d.cache[sequence]
	if ok {
		return key, nil
	}

	key, err := d.db.GetCryptoKeyByFeatureAndSequence(ctx, database.GetCryptoKeyByFeatureAndSequenceParams{
		Feature:  d.feature,
		Sequence: sequence,
	})
	if xerrors.Is(err, sql.ErrNoRows) {
		return database.CryptoKey{}, ErrKeyNotFound
	}
	if err != nil {
		return database.CryptoKey{}, err
	}

	if key.IsInvalid(now) {
		return database.CryptoKey{}, ErrKeyInvalid
	}

	if key.IsActive(now) && key.Sequence > d.latestKey.Sequence {
		d.latestKey = key
	}

	d.cache[sequence] = key

	return key, nil
}

func (d *DBKeychain) Latest(ctx context.Context) (database.CryptoKey, error) {
	d.cacheMu.RLock()
	now := d.clock.Now().UTC()
	if d.latestKey.IsActive(now) {
		d.cacheMu.RUnlock()
		return d.latestKey, nil
	}
	d.cacheMu.RUnlock()

	d.cacheMu.Lock()
	defer d.cacheMu.Unlock()

	if d.latestKey.IsActive(now) {
		return d.latestKey, nil
	}

	err := d.newCache(ctx)
	if err != nil {
		return database.CryptoKey{}, xerrors.Errorf("new cache: %w", err)
	}

	return d.latestKey, nil
}

func (d *DBKeychain) refreshCache(ctx context.Context) {
	d.clock.TickerFunc(ctx, time.Minute*10, func() error {
		d.cacheMu.Lock()
		defer d.cacheMu.Unlock()
		if err := d.newCache(ctx); err != nil {
			d.logger.Error(ctx, "failed to refresh cache", slog.Error(err))
		}
		return nil
	})
}

func (d *DBKeychain) newCache(ctx context.Context) error {
	now := d.clock.Now().UTC()
	keys, err := d.db.GetCryptoKeysByFeature(ctx, d.feature)
	if err != nil {
		return xerrors.Errorf("get crypto keys by feature: %w", err)
	}
	if len(keys) == 0 {
		return ErrKeyNotFound
	}

	cache := toMap(keys)

	var latest database.CryptoKey
	for _, key := range keys {
		if !key.IsActive(now) {
			continue
		}
		latest = key
		break
	}

	if latest.IsInvalid(now) {
		return ErrKeyInvalid
	}

	d.cache = cache
	d.latestKey = latest
	return nil
}

func toMap(keys []database.CryptoKey) map[int32]database.CryptoKey {
	m := make(map[int32]database.CryptoKey)
	for _, key := range keys {
		m[key.Sequence] = key
	}
	return m
}
