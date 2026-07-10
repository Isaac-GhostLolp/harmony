const Database = require('better-sqlite3')
const db = new Database(':memory:')
db.exec(`
  CREATE TABLE artists (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE albums (id INTEGER PRIMARY KEY, artist_id INTEGER);
  CREATE TABLE song_artists (song_id INTEGER, artist_id INTEGER);
  INSERT INTO artists (id, name) VALUES (1,'Skillet'),(2,'Lacey Sturm'),(3,'Skillet feat. Lacey Sturm'),(4,'Eminem');
  INSERT INTO song_artists (song_id, artist_id) VALUES (10,1),(10,2),(11,4);
`)
console.log('Antes:', db.prepare('SELECT id,name FROM artists ORDER BY id').all().map(a=>a.name).join(', '))
db.prepare(`DELETE FROM artists
  WHERE id NOT IN (SELECT DISTINCT artist_id FROM song_artists)
    AND id NOT IN (SELECT DISTINCT artist_id FROM albums WHERE artist_id IS NOT NULL)`).run()
console.log('Depois:', db.prepare('SELECT id,name FROM artists ORDER BY id').all().map(a=>a.name).join(', '))
