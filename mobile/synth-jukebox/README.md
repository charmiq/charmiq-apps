# Synth Jukebox

*A music library whose albums are composed and played live on your phone, from their genre and a seed: no audio files, no streaming. Compose a new album whenever you like, or describe a song in the Studio and Lyria 3 Pro writes, plays and sings it for you.*

- **Open it:** [iOS](charmiq://./iOS.md). Home-screen setup: [Mobile](charmiq://../README.md).
- **Your library** (`library.json`, the Application's app-content): the albums, your Studio takes and your Loved songs. Everyone you share the document with sees the same library.
- **Where you left off** (the Application's app-state): what is playing, the queue, position, volume and the tab you were on. Launch it again and it picks up there.
- **Sound:** tap play to start; iOS starts audio only from a tap. It plays even with the phone in Silent mode.

## The Studio

- **Describe a song** in the Studio tab, or take one of the ideas it types out, add a few ingredients (a genre, a mood, vocals or instrumental, a tempo) and tap **Press It**. Lyria 3 Pro writes a whole song, up to three minutes, in about half a minute. Each press uses credits.
- **Every take gets its own cover**, painted from the same description once the song is accepted (about a cent more). Until it arrives, and if it ever fails, the take wears a sleeve the app paints itself.
- **Every take gets its own name:** a title of up to three words and an artist, written for it by a small language model from the same description (a fraction of a cent). The take's title flips over like a departures board until the name lands; if no usable name comes back it keeps the one the app gave it, and a name you set yourself always wins.
- **While it presses**, its record spins in the Studio with a running clock until the song and its cover are both done, and the Studio tab counts the takes still pressing. A song that finishes first plays right away while its cover is still painting; a cover that finishes first spins as a picture disc until the song lands. You can leave the app: the take keeps pressing, and the next time the app is open it picks the finished parts up.
- **When it is done**, it says so with a **Play** button, on every phone showing the library. A take is marked **STUDIO** wherever it appears: Home, Library → Studio Takes, Search and Now Playing, where it shows its spectrum instead of a live score.
- **Make it yours:** **Rename** in a take's **…** menu (its page, any of its rows, or Now Playing) gives it your own title and artist. A take without a cover, or whose cover failed, offers **Paint Cover** there too.
- **Where the songs live:** each take is an audio file in your Drive, and its cover an image there. Removing a take from the library leaves its files there. A press that fails says why in one line and offers **Try Again**, **Edit** or **Remove**.
- **It asks permission once:** to use the Platform's generation server (to press, name and paint songs) and file server (to check on them and play them).
