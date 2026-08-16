# Uploading to YouTube — and the audio question

## Read this before you upload anything

**YouTube does not let you replace a video file after upload.** You can change
the title, description, thumbnail and tags forever, but the *footage itself* is
permanent. If you want to swap in the finished film later, that is a **new
upload with a new URL** — the views, comments and link on the first one do not
carry over.

This matters right now, because what you have today is the **animatic**: previz
with graphic stand-ins, and **no audio at all**. It is silent.

So do not spend the good title on it. Two sane paths:

| | Today (animatic) | Later (finished film) |
| --- | --- | --- |
| **Recommended** | Upload **Unlisted**, send your nephew the link directly | Upload **Public** as the real video, with the title and thumbnail from `titles.md` |
| Alternative | Don't upload yet — send him the MP4 directly | — |

Unlisted means anyone with the link can watch, but it never appears in search,
your channel page, or recommendations. It is the right setting for a personal
share and for a work in progress.

---

## Can you add audio inside YouTube?

**Partly — and not the part you need.**

YouTube Studio's built-in editor can add **background music only**, taken from
YouTube's own Audio Library:

> YouTube Studio → **Content** → click the video → **Editor** →
> **Audio** → browse or search the Audio Library → **ADD** → drag to position →
> **SAVE**

What that gets you:

- Free, cleared music that will never trigger a copyright claim
- No re-upload — the URL and any views stay intact

What it **cannot** do:

- **Add narration.** There is no voice-over recording or upload in YouTube. This
  is the blocker: your film is 88% narration by runtime. Music alone leaves 7:54
  of silence where the script should be.
- **Mix properly.** The brief calls for narration peaking at −3 dB with music
  ducked to −18 dB underneath it. YouTube gives you a single music track with
  crude volume control and no ducking.
- **Sync to picture.** You cannot land a music cue on an act change or hold the
  deliberate silence before the AI-integrity scene.

Processing after you save an edit can also take several hours, and the edit
applies to the whole video at once.

**Conclusion: the narration has to be on the file before it reaches YouTube.**
Use the Audio Library only for a music bed on top of a film that already has its
voice-over.

---

## Getting narration onto it

In rough order of how good the result will be:

### 1. Record it yourself (free, available today)

786 words, about 7 minutes of speech. A phone voice recorder in a quiet room
with soft furnishings is genuinely good enough — read from
[`script/narration.md`](../../script/narration.md), which is already timed cue by
cue.

For a gift to a nephew starting university, **your own voice is worth more than
any synthetic one.** This is the option I would pick.

Send me the audio file and I will mix it onto the animatic and hand you back a
finished MP4.

### 2. Text-to-speech (free tiers exist, quality varies)

Faster, and it removes the nerves of recording. It will sound like narration
rather than like an uncle talking to his nephew. Your call which matters more
here.

### 3. Wait for the full production (needs credits)

The proper route: a Sri Lankan English narrator, scored music, and the finished
3D render. See [`docs/production-guide.md`](../../docs/production-guide.md).

---

## Upload checklist

1. **File** — `deliverables/animatic.mp4` (1080p) — or the 720p version if your
   connection is slow. Quality is identical for this content.
2. **Title** — see [`titles.md`](titles.md). Save the strongest one for the
   finished film.
3. **Description** — paste [`description.txt`](description.txt) as-is. The
   chapter timestamps are generated from the actual cut, so the chapter bar will
   appear automatically.
4. **Thumbnail** — `deliverables/thumbnails/thumbnail-b.png` (1280×720, ~1 MB,
   well under YouTube's 2 MB cap). Requires a verified phone number on the
   account to upload a custom thumbnail.
5. **Subtitles** — upload `deliverables/animatic.srt` under
   Subtitles → Add → Upload file → **With timing**. Do this even though captions
   are burned into the animatic; real subtitles are searchable and can be
   auto-translated.
6. **Visibility** — **Unlisted** for the animatic.
7. **Audience** — "No, it's not made for kids". Getting this wrong disables
   comments and several features.
8. **Category** — Education.
9. **Tags** — paste [`tags.txt`](tags.txt) (311 characters, under the 500 cap).

## After the finished film exists

Upload it as a **new public video**, then edit the animatic's description to
point at it, and leave the animatic unlisted as a behind-the-scenes artefact.
Previz is genuinely interesting to students — it just should not be the thing
that represents the work.
