# Chat benchmark data

A made-up French WhatsApp-style conversation between two people: 10,000 messages and 30 photos.
It is deterministic: the same seed (`42`) always produces the same `messages.json`.

```
messages.json   10,000 messages, sorted by id and timestamp
photos/         30 JPEGs (photo_01.jpg … photo_30.jpg), 1080px wide
generate.py     generator script (Python 3, standard library only)
```

Regenerate the data with `python3 generate.py`. Add `--photos` to also download any missing photos.

## Message format

`messages.json` is a JSON array of objects:

| field       | type                            | present when                                |
|-------------|---------------------------------|---------------------------------------------|
| `id`        | integer, 1…10000                | always                                      |
| `author`    | `"me"` \| `"them"`              | always                                      |
| `timestamp` | ISO 8601 UTC string, e.g. `"2025-01-06T08:00:08Z"` | always, strictly increasing |
| `type`      | `"text"` \| `"photo"` \| `"voice"` | always                                   |
| `text`      | string (UTF-8, can contain emojis and `\n`) | always for `text`; optional caption on about 30% of `photo` messages |
| `photo`     | file name inside `photos/`, e.g. `"photo_07.jpg"` | `photo` only                 |
| `duration`  | integer number of seconds, 1…300 | `voice` only                               |

```json
{"id": 4, "author": "them", "timestamp": "2025-01-06T08:26:15Z", "type": "text",
 "text": "L'après-midi est passé à toute vitesse.\nEt là je suis enfin dans le métro 🚇"}
{"id": 5, "author": "me", "timestamp": "2025-01-06T08:26:32Z", "type": "photo", "photo": "photo_24.jpg"}
{"id": 18, "author": "them", "timestamp": "2025-01-06T15:07:41Z", "type": "voice", "duration": 17}
```

## What the data looks like

- **Types:** 7,904 text (79%), 1,243 photo (12%), 853 voice (9%). The split is random with weights 80/12/8.
- **Text length:** from 2 words (`"Ok ça marche 👍"`) to messages of 6 lines. About 40% are short replies, 35% one sentence, 17% two or three sentences, and 8% have several lines.
- **Rhythm:** the same person often sends several messages in a row. Most gaps are a few seconds to a few minutes, with some gaps of several hours. Nobody writes between midnight and 7am. The conversation runs from 2025-01-06 to 2025-08-15.
- **Voice notes:** durations follow a log-normal curve, with a median around 16 seconds.

## Photos

The photos come from [Lorem Picsum](https://picsum.photos), which serves Unsplash images under the [Unsplash License](https://unsplash.com/license) (free to use). Each file is a fixed Picsum id (see `PICSUM_IDS` in `generate.py`), so they are always the same images. Sizes are 1080×1080, 1080×1350 or 1080×720 (about 4.6 MB in total). Every photo message points to one of these 30 files.
