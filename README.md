# Grasshopper Workshop

A free video course on Rhino and Grasshopper, taught in Bangla by Shafiul Islam.

**Take the course:** https://shafiarch.github.io/grasshopper_course/

The lessons are recorded on YouTube in the [Grasshopper Workshop playlist](https://www.youtube.com/playlist?list=PLOYhAlTvbgcPsxvQGb6rHEHhhsagSbkl0). The website lays them out as a course and keeps track of each learner's progress:

- finished lessons (a lesson completes once 90% of it is watched, or the learner marks it)
- where the learner stopped in each video, so they can resume
- notes linked to moments in the video, which can be exported as a Markdown file
- time spent, a daily streak and an activity calendar
- a progress backup file, to move progress to another browser or device

Progress is stored in each learner's own browser. Nothing is sent to a server.

## Updating the course

All course content lives in `course.js`.

**With the editor.** Open https://shafiarch.github.io/grasshopper_course/editor.html. Paste a YouTube link to add a lesson; its title and length fill in automatically. Edit text, reorder lessons or add a module, then select **Download course.js** and upload the file here to replace the old one.

**By hand.** Open `course.js` on GitHub, copy a lesson line, change its `id`, `youtube` and `title`, and commit.

Lesson numbers come from the order of the lessons in the file. Progress is tied to each YouTube video, so renaming or reordering lessons keeps everyone's progress.

## Files

- `index.html`: the course site
- `course.js`: course details and the lesson list
- `editor.html`: the course editor (not linked from the site)
- `assets/`: styles, scripts, the font and images

## Credits

Course and lessons by Shafiul Islam, MS Design Technology, University of Washington.

The site uses the Archivo typeface by Omnibus-Type, licensed under the SIL Open Font License (see `assets/fonts/OFL.txt`).
