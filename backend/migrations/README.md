Numbered `.sql` files, applied in order by `app.db.run_migrations`.

Name each file `NNN_description.sql` (e.g. `001_init.sql`). The leading
number becomes `PRAGMA user_version` after the file applies, so each number
must be used once and files must apply cleanly in sequence — no gaps, no
reordering existing files.
