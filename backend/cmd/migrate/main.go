// Command migrate applies the SQL files in ./migrations (or MIGRATIONS_DIR) in order and records them in
// schema_migrations. Safe on databases created by the old docker-entrypoint-initdb.d flow: statements that fail
// only because the object already exists (duplicate column / table / key) are skipped.
package main

import (
	"database/sql"
	"errors"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/go-sql-driver/mysql"

	"github.com/thairung/e-agm/pkg/config"
	"github.com/thairung/e-agm/pkg/db"
)

// MySQL error numbers meaning "already applied".
var alreadyExists = map[uint16]bool{1050: true, 1060: true, 1061: true, 1062: true, 1091: true}

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	d, err := db.Open(cfg.DSN())
	if err != nil {
		log.Fatal(err)
	}
	defer d.Close()
	dir := os.Getenv("MIGRATIONS_DIR")
	if dir == "" {
		dir = "migrations"
	}
	if _, err := d.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		log.Fatal(err)
	}
	files, _ := filepath.Glob(filepath.Join(dir, "*.sql"))
	sort.Strings(files)
	for _, f := range files {
		name := filepath.Base(f)
		var n int
		d.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE name=?`, name).Scan(&n)
		if n > 0 {
			continue
		}
		b, err := os.ReadFile(f)
		if err != nil {
			log.Fatal(err)
		}
		if err := apply(d, string(b)); err != nil {
			log.Fatalf("%s: %v", name, err)
		}
		d.Exec(`INSERT INTO schema_migrations(name) VALUES(?)`, name)
		log.Printf("applied %s", name)
	}
	log.Print("migrations up to date")
}

func apply(d *sql.DB, script string) error {
	var cleaned []string
	for _, line := range strings.Split(script, "\n") {
		if i := strings.Index(line, "--"); i >= 0 {
			line = line[:i]
		}
		cleaned = append(cleaned, line)
	}
	for _, stmt := range strings.Split(strings.Join(cleaned, "\n"), ";") {
		if strings.TrimSpace(stmt) == "" {
			continue
		}
		if _, err := d.Exec(stmt); err != nil {
			var me *mysql.MySQLError
			if errors.As(err, &me) && alreadyExists[me.Number] {
				continue
			}
			return err
		}
	}
	return nil
}
