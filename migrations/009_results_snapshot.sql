-- Results of a closed agenda are frozen: the tallies are stored at close (JSON) so a later registration, cancellation
-- or online verification cannot change them.
ALTER TABLE termpartner ADD COLUMN result_snapshot MEDIUMTEXT NULL;
-- Admin switch: holders may see the running / closed totals on the online results page.
ALTER TABLE master ADD COLUMN results_published TINYINT NOT NULL DEFAULT 0;
