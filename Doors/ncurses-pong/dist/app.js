"use strict";
/**
 * ncurses-pong - Port of vicentebolea/Pong-curses (~71 lines)
 *
 * Original C code: https://github.com/vicentebolea/Pong-curses
 * Author: Vicente Adolfo Bolea Sanchez <vicente.bolea@gmail.com>
 *
 * This port validates the ncurses compatibility layer by porting
 * a real ncurses game with minimal changes from the original C.
 *
 * Key differences from C:
 * - typedef struct replaced with interface
 * - getmaxyx macro replaced with getLINES/getCOLS
 * - the C `while (!end) { usleep(4000); ... getch(); }` loop is INVERTED:
 *   a BBS door is driven by the caller's keystrokes, not by a blocking read.
 *   `start()` paints and parks the loop on an interval it owns; `tick()` is
 *   one iteration of the old loop body; `handleKey()` is the old
 *   `switch (getch())`. See the report referenced in index.ts for why.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PongDoor = exports.PONG_TICK_MS = void 0;
const ncurses_1 = require("@amiexpress/bbs-door-sdk/ncurses");
function newObject() {
    return { x: 0, y: 0, c: 0, movhor: false, movver: false };
}
/**
 * Browser `KeyboardEvent.key` -> the short name doors think in.
 *
 * Same mapping as the SDK's `DoorInputManager.normaliseKeyName`
 * (`sdk/utils/door-input-manager.ts:233-245`), which is `private static` and
 * so cannot be imported. Kept in step with it deliberately: the two must
 * agree on names or a door and the manager would disagree about "up".
 */
function normaliseKeyName(key) {
    switch (key) {
        case "ArrowLeft": return "left";
        case "ArrowRight": return "right";
        case "ArrowUp": return "up";
        case "ArrowDown": return "down";
        case " ":
        case "Spacebar": return "space";
        case "Enter": return "enter";
        case "Escape": return "escape";
        default: return key.toLowerCase();
    }
}
/** The keys that move a paddle - the ones the held-key loop owns. */
const MOVEMENT_KEYS = new Set(["up", "down", "q", "a"]);
/**
 * One tick of the game loop.
 *
 * Original C: usleep(4000) - 4000 microseconds = 4ms.
 * BBS optimisation: 33ms = ~30fps, much better for network/CPU.
 */
exports.PONG_TICK_MS = 33;
class PongDoor {
    constructor() {
        this.name = "ncurses-pong";
        this.version = "1.0.0";
        this.author = "Vicente Bolea (original), AmiExpress (port)";
        this.description = "Classic Pong - ncurses port validation";
        this.phase = "finished";
        this.loop = null;
        this.quitCallback = null;
        this.scrX = 0;
        this.scrY = 0;
        this.cont = 0;
        /**
         * Keys held right now, from real key-down/key-up edges.
         *
         * The client's game-mode auto-repeat waits 400 ms before it starts
         * (`packages/terminal/src/components/BBSTerminal.tsx:1342`), so a door that
         * moves once per delivered key stutters on a held key however fast the game
         * loop runs. Every arcade door in this repo avoids that the same way - hold
         * the key state, step once per frame - and this is that state.
         */
        this.held = new Set();
        /**
         * True once a real key-down edge has arrived, i.e. this caller's transport
         * sends key events at all. Telnet does not, and there the character path
         * below stays in charge.
         */
        this.keyEdges = false;
        this.b1 = newObject(); // player 1 paddle (right)
        this.b2 = newObject(); // player 2 paddle (left)
        this.ball = newObject();
    }
    /**
     * Initialise ncurses, paint the title screen, park the game loop, RETURN.
     *
     * Returning is the whole point: `Door.execute()` only reaches the SDK input
     * loop - the one thing that installs `bbsSession.doorInputHandler` - after
     * every start handler has resolved (sdk/src/core/Door.ts:118-131, :250).
     *
     * @param context - the ncurses I/O context (anything with `emit`/`write`)
     * @param onQuit  - called once, when the player has pressed ESC
     */
    start(context, onQuit) {
        this.quitCallback = onQuit;
        // Original C: initscr(); start_color(); init_pair(1,COLOR_BLUE,COLOR_BLACK);
        (0, ncurses_1.initscr)(context);
        (0, ncurses_1.start_color)();
        (0, ncurses_1.init_pair)(1, ncurses_1.COLOR_BLUE, ncurses_1.COLOR_BLACK);
        // Original C: keypad(stdscr,true); noecho(); curs_set(0);
        const stdscr = (0, ncurses_1.getStdscr)();
        if (stdscr) {
            (0, ncurses_1.keypad)(stdscr, true);
        }
        (0, ncurses_1.noecho)();
        (0, ncurses_1.curs_set)(0);
        // Original C: getmaxyx(stdscr,scr.y,scr.x);
        this.scrY = (0, ncurses_1.getLINES)();
        this.scrX = (0, ncurses_1.getCOLS)();
        // Original C: object b1={scr.x-2,scr.y/2,0,false,false}, ...
        this.b1 = { x: this.scrX - 2, y: Math.floor(this.scrY / 2), c: 0, movhor: false, movver: false };
        this.b2 = { x: 1, y: Math.floor(this.scrY / 2), c: 0, movhor: false, movver: false };
        this.ball = {
            x: Math.floor(this.scrX / 2),
            y: Math.floor(this.scrY / 2),
            c: 0,
            movhor: false,
            movver: false,
        };
        this.cont = 0;
        // Show title screen
        (0, ncurses_1.mvprintw)(4, 0, "\t           oooooooooo                                        \n" +
            "\t           888    888  ooooooo    ooooooo    oooooooo8       \n" +
            "\t           888oooo88 888     888 888   888  888    88o       \n" +
            "\t           888       888     888 888   888   888oo888o       \n" +
            "\t          o888o        88ooo88  o888o o888o 888     888      \n" +
            "\t                                             888ooo888     \n\n" +
            "\t Original by Vicente Bolea - Ported to AmiExpress ncurses   \n" +
            "\t \t\t\tPlayer 1 controls: UP/DOWN arrows                \n" +
            "\t \t\t\tPlayer 2 controls: Q (up) and A (down)           \n" +
            "\t \t\t\tPress ANY key to start, P for pause, ESC to quit");
        (0, ncurses_1.refresh)(); // CRITICAL: Flush output to terminal before waiting for input
        this.phase = "title";
        // The loop this door owns. It runs from the title screen on so that the
        // game has a heartbeat of its own the moment the caller starts it, and it
        // is cleared in stop().
        this.loop = setInterval(() => this.tick(), exports.PONG_TICK_MS);
    }
    /**
     * One iteration of the original `for (nodelay(stdscr,1); !end; usleep(4000))`
     * body, minus the `getch()` (keys arrive through handleKey now).
     */
    tick() {
        if (this.phase !== "playing")
            return;
        const { b1, b2, ball: b } = this;
        const scrX = this.scrX;
        const scrY = this.scrY;
        // Movement comes from the held keys, once per frame - Arkanoid's cadence,
        // and what `DoorInputManager.consumeRepeat` gives with its defaults
        // (`sdk/utils/door-input-manager.ts:322-340`). No client auto-repeat is
        // involved, so there is no 400 ms hesitation before the paddle moves.
        this.stepHeldPaddles();
        // Original C: if (++cont%16==0)
        // Adjust game logic to match new tick rate (was 16 ticks @ 4ms = 64ms).
        // With 33ms ticks, we update every 2 ticks (~66ms).
        this.cont++;
        if (this.cont % 2 === 0) {
            // Ball vertical bounce
            if (b.y === scrY - 1 || b.y === 1) {
                b.movver = !b.movver;
            }
            // Ball horizontal bounce (paddle collision)
            if (b.x >= scrX - 2 || b.x <= 2) {
                b.movhor = !b.movhor;
                if (b.y === b1.y - 1 || b.y === b2.y - 1) {
                    b.movver = false;
                }
                else if (b.y === b1.y + 1 || b.y === b2.y + 1) {
                    b.movver = true;
                }
                else if (b.y !== b1.y && b.y !== b2.y) {
                    // Score!
                    if (b.x >= scrX - 2) {
                        b1.c++;
                    }
                    else {
                        b2.c++;
                    }
                    // Reset ball
                    b.x = Math.floor(scrX / 2);
                    b.y = Math.floor(scrY / 2);
                }
            }
            // Move ball
            b.x = b.movhor ? b.x + 1 : b.x - 1;
            b.y = b.movver ? b.y + 1 : b.y - 1;
        }
        // Original C wrapped the paddles inside the physics tick; they can now
        // move on any frame, so the wrap runs on any frame too - otherwise a held
        // key can walk a paddle off the board for a frame before it is caught.
        if (b1.y <= 1)
            b1.y = scrY - 2;
        if (b1.y >= scrY - 1)
            b1.y = 2;
        if (b2.y <= 1)
            b2.y = scrY - 2;
        if (b2.y >= scrY - 1)
            b2.y = 2;
        this.draw();
    }
    /**
     * A real key-down edge, from `bbs.onKeyDown`.
     *
     * The client re-sends key-down while a key auto-repeats; only the first
     * edge matters, and `Set.add` makes that free.
     */
    holdKey(key) {
        this.keyEdges = true;
        this.held.add(normaliseKeyName(key));
    }
    /** A real key-up edge, from `bbs.onKeyUp`. */
    releaseKey(key) {
        this.held.delete(normaliseKeyName(key));
    }
    /** Original C: the KEY_UP / KEY_DOWN / Q / A arms of `switch (getch())`. */
    stepHeldPaddles() {
        if (!this.keyEdges)
            return;
        if (this.held.has("up"))
            this.b1.y--;
        if (this.held.has("down"))
            this.b1.y++;
        if (this.held.has("q"))
            this.b2.y--;
        if (this.held.has("a"))
            this.b2.y++;
    }
    /**
     * The original `switch (getch())`, driven by the caller's keystroke.
     *
     * @param name - a key name as parsed off the wire: "up", "down", "escape",
     *               or the character itself.
     */
    handleKey(name) {
        if (this.phase === "finished")
            return;
        // Original C: the `await getch()` under the title screen, and the
        // `nodelay(false); await getch(); nodelay(true);` of the pause - both are
        // "any key continues".
        if (this.phase === "title" || this.phase === "paused") {
            this.phase = "playing";
            return;
        }
        // In game mode a key-down reaches the door on BOTH paths - the key-state
        // handler at `socket-handlers.ts:527` and the input handler at :536 - so
        // once real edges are arriving, movement belongs to the held-key loop
        // alone. Acting here as well would step the paddle twice per press
        // (`sdk/utils/door-input-manager.ts:287-292` says the same).
        if (this.keyEdges && MOVEMENT_KEYS.has(name))
            return;
        switch (name) {
            case "down":
                this.b1.y++;
                break;
            case "up":
                this.b1.y--;
                break;
            case "q":
            case "Q":
                this.b2.y--;
                break;
            case "a":
            case "A":
                this.b2.y++;
                break;
            case "p":
            case "P":
                // Pause - wait for any key
                this.phase = "paused";
                break;
            case "escape":
                this.quit();
                break;
        }
    }
    /**
     * Stop the game loop and leave ncurses mode. Idempotent: the door calls it
     * from its close handler as well as from the ESC path, and `endwin()` puts
     * real bytes on the wire (show cursor, reset attributes, leave the alternate
     * screen). The phase guard is what makes the second call a no-op HERE,
     * rather than leaning on `endwin()`'s own `initialized` check
     * (`sdk/engines/ui/ncurses/ncurses.ts:246-249`) to swallow it.
     */
    stop() {
        if (this.phase === "finished")
            return;
        if (this.loop) {
            clearInterval(this.loop);
            this.loop = null;
        }
        this.phase = "finished";
        this.held.clear();
        this.keyEdges = false;
        (0, ncurses_1.endwin)();
    }
    /** Original C: `end = true;` and the `endwin()` after the loop. */
    quit() {
        const onQuit = this.quitCallback;
        this.quitCallback = null;
        this.stop();
        if (onQuit)
            onQuit();
    }
    /** The drawing half of the original loop body. */
    draw() {
        const { b1, b2, ball: b } = this;
        const scrX = this.scrX;
        const scrY = this.scrY;
        (0, ncurses_1.erase)();
        // Score display
        (0, ncurses_1.mvprintw)(2, Math.floor(scrX / 2) - 2, `${b1.c} | ${b2.c}`);
        // Center line
        (0, ncurses_1.mvvline)(0, Math.floor(scrX / 2), ncurses_1.ACS_VLINE, scrY);
        // Ball and paddles in blue
        (0, ncurses_1.attron)((0, ncurses_1.COLOR_PAIR)(1));
        (0, ncurses_1.mvprintw)(b.y, b.x, "o");
        for (let i = -1; i < 2; i++) {
            (0, ncurses_1.mvprintw)(b1.y + i, b1.x, "|");
            (0, ncurses_1.mvprintw)(b2.y + i, b2.x, "|");
        }
        (0, ncurses_1.attroff)((0, ncurses_1.COLOR_PAIR)(1));
        (0, ncurses_1.refresh)(); // CRITICAL: Send the updated buffer to the terminal!
    }
}
exports.PongDoor = PongDoor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpQkc7OztBQUVILDhEQThCMEM7QUFXMUMsU0FBUyxTQUFTO0lBQ2hCLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUM1RCxDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNILFNBQVMsZ0JBQWdCLENBQUMsR0FBVztJQUNuQyxRQUFRLEdBQUcsRUFBRSxDQUFDO1FBQ1osS0FBSyxXQUFXLENBQUMsQ0FBQyxPQUFPLE1BQU0sQ0FBQztRQUNoQyxLQUFLLFlBQVksQ0FBQyxDQUFDLE9BQU8sT0FBTyxDQUFDO1FBQ2xDLEtBQUssU0FBUyxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUM7UUFDNUIsS0FBSyxXQUFXLENBQUMsQ0FBQyxPQUFPLE1BQU0sQ0FBQztRQUNoQyxLQUFLLEdBQUcsQ0FBQztRQUNULEtBQUssVUFBVSxDQUFDLENBQUMsT0FBTyxPQUFPLENBQUM7UUFDaEMsS0FBSyxPQUFPLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQztRQUM3QixLQUFLLFFBQVEsQ0FBQyxDQUFDLE9BQU8sUUFBUSxDQUFDO1FBQy9CLE9BQU8sQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3BDLENBQUM7QUFDSCxDQUFDO0FBRUQscUVBQXFFO0FBQ3JFLE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQVd4RDs7Ozs7R0FLRztBQUNVLFFBQUEsWUFBWSxHQUFHLEVBQUUsQ0FBQztBQUUvQixNQUFhLFFBQVE7SUFBckI7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Q0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUNELElBQUEsaUJBQU8sRUFBQyxJQUFBLG9CQUFVLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV2QixJQUFBLGlCQUFPLEdBQUUsQ0FBQyxDQUFDLHFEQUFxRDtJQUNsRSxDQUFDO0NBQ0Y7QUF4U0QsNEJBd1NDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBuY3Vyc2VzLXBvbmcgLSBQb3J0IG9mIHZpY2VudGVib2xlYS9Qb25nLWN1cnNlcyAofjcxIGxpbmVzKVxuICpcbiAqIE9yaWdpbmFsIEMgY29kZTogaHR0cHM6Ly9naXRodWIuY29tL3ZpY2VudGVib2xlYS9Qb25nLWN1cnNlc1xuICogQXV0aG9yOiBWaWNlbnRlIEFkb2xmbyBCb2xlYSBTYW5jaGV6IDx2aWNlbnRlLmJvbGVhQGdtYWlsLmNvbT5cbiAqXG4gKiBUaGlzIHBvcnQgdmFsaWRhdGVzIHRoZSBuY3Vyc2VzIGNvbXBhdGliaWxpdHkgbGF5ZXIgYnkgcG9ydGluZ1xuICogYSByZWFsIG5jdXJzZXMgZ2FtZSB3aXRoIG1pbmltYWwgY2hhbmdlcyBmcm9tIHRoZSBvcmlnaW5hbCBDLlxuICpcbiAqIEtleSBkaWZmZXJlbmNlcyBmcm9tIEM6XG4gKiAtIHR5cGVkZWYgc3RydWN0IHJlcGxhY2VkIHdpdGggaW50ZXJmYWNlXG4gKiAtIGdldG1heHl4IG1hY3JvIHJlcGxhY2VkIHdpdGggZ2V0TElORVMvZ2V0Q09MU1xuICogLSB0aGUgQyBgd2hpbGUgKCFlbmQpIHsgdXNsZWVwKDQwMDApOyAuLi4gZ2V0Y2goKTsgfWAgbG9vcCBpcyBJTlZFUlRFRDpcbiAqICAgYSBCQlMgZG9vciBpcyBkcml2ZW4gYnkgdGhlIGNhbGxlcidzIGtleXN0cm9rZXMsIG5vdCBieSBhIGJsb2NraW5nIHJlYWQuXG4gKiAgIGBzdGFydCgpYCBwYWludHMgYW5kIHBhcmtzIHRoZSBsb29wIG9uIGFuIGludGVydmFsIGl0IG93bnM7IGB0aWNrKClgIGlzXG4gKiAgIG9uZSBpdGVyYXRpb24gb2YgdGhlIG9sZCBsb29wIGJvZHk7IGBoYW5kbGVLZXkoKWAgaXMgdGhlIG9sZFxuICogICBgc3dpdGNoIChnZXRjaCgpKWAuIFNlZSB0aGUgcmVwb3J0IHJlZmVyZW5jZWQgaW4gaW5kZXgudHMgZm9yIHdoeS5cbiAqL1xuXG5pbXBvcnQge1xuICAvLyBJbml0aWFsaXphdGlvblxuICBpbml0c2NyLFxuICBlbmR3aW4sXG4gIHN0YXJ0X2NvbG9yLFxuICBpbml0X3BhaXIsXG4gIGtleXBhZCxcbiAgbm9lY2hvLFxuICBjdXJzX3NldCxcbiAgZ2V0U3Rkc2NyLFxuXG4gIC8vIFNjcmVlbiBpbmZvXG4gIGdldExJTkVTLFxuICBnZXRDT0xTLFxuXG4gIC8vIE91dHB1dFxuICBtdnByaW50dyxcbiAgbXZ2bGluZSxcbiAgZXJhc2UsXG4gIHJlZnJlc2gsXG5cbiAgLy8gQXR0cmlidXRlc1xuICBhdHRyb24sXG4gIGF0dHJvZmYsXG4gIENPTE9SX1BBSVIsXG5cbiAgLy8gQ29uc3RhbnRzXG4gIENPTE9SX0JMVUUsXG4gIENPTE9SX0JMQUNLLFxuICBBQ1NfVkxJTkUsXG59IGZyb20gXCJAYW1pZXhwcmVzcy9iYnMtZG9vci1zZGsvbmN1cnNlc1wiO1xuXG4vLyBPcmlnaW5hbCBDOiB0eXBlZGVmIHN0cnVjdHtzaG9ydCBpbnQgeCwgeSwgYzsgYm9vbCBtb3Zob3IsIG1vdnZlcjt9IG9iamVjdDtcbmludGVyZmFjZSBHYW1lT2JqZWN0IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIGM6IG51bWJlcjsgLy8gc2NvcmUgY291bnRlclxuICBtb3Zob3I6IGJvb2xlYW47XG4gIG1vdnZlcjogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gbmV3T2JqZWN0KCk6IEdhbWVPYmplY3Qge1xuICByZXR1cm4geyB4OiAwLCB5OiAwLCBjOiAwLCBtb3Zob3I6IGZhbHNlLCBtb3Z2ZXI6IGZhbHNlIH07XG59XG5cbi8qKlxuICogQnJvd3NlciBgS2V5Ym9hcmRFdmVudC5rZXlgIC0+IHRoZSBzaG9ydCBuYW1lIGRvb3JzIHRoaW5rIGluLlxuICpcbiAqIFNhbWUgbWFwcGluZyBhcyB0aGUgU0RLJ3MgYERvb3JJbnB1dE1hbmFnZXIubm9ybWFsaXNlS2V5TmFtZWBcbiAqIChgc2RrL3V0aWxzL2Rvb3ItaW5wdXQtbWFuYWdlci50czoyMzMtMjQ1YCksIHdoaWNoIGlzIGBwcml2YXRlIHN0YXRpY2AgYW5kXG4gKiBzbyBjYW5ub3QgYmUgaW1wb3J0ZWQuIEtlcHQgaW4gc3RlcCB3aXRoIGl0IGRlbGliZXJhdGVseTogdGhlIHR3byBtdXN0XG4gKiBhZ3JlZSBvbiBuYW1lcyBvciBhIGRvb3IgYW5kIHRoZSBtYW5hZ2VyIHdvdWxkIGRpc2FncmVlIGFib3V0IFwidXBcIi5cbiAqL1xuZnVuY3Rpb24gbm9ybWFsaXNlS2V5TmFtZShrZXk6IHN0cmluZyk6IHN0cmluZyB7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSBcIkFycm93TGVmdFwiOiByZXR1cm4gXCJsZWZ0XCI7XG4gICAgY2FzZSBcIkFycm93UmlnaHRcIjogcmV0dXJuIFwicmlnaHRcIjtcbiAgICBjYXNlIFwiQXJyb3dVcFwiOiByZXR1cm4gXCJ1cFwiO1xuICAgIGNhc2UgXCJBcnJvd0Rvd25cIjogcmV0dXJuIFwiZG93blwiO1xuICAgIGNhc2UgXCIgXCI6XG4gICAgY2FzZSBcIlNwYWNlYmFyXCI6IHJldHVybiBcInNwYWNlXCI7XG4gICAgY2FzZSBcIkVudGVyXCI6IHJldHVybiBcImVudGVyXCI7XG4gICAgY2FzZSBcIkVzY2FwZVwiOiByZXR1cm4gXCJlc2NhcGVcIjtcbiAgICBkZWZhdWx0OiByZXR1cm4ga2V5LnRvTG93ZXJDYXNlKCk7XG4gIH1cbn1cblxuLyoqIFRoZSBrZXlzIHRoYXQgbW92ZSBhIHBhZGRsZSAtIHRoZSBvbmVzIHRoZSBoZWxkLWtleSBsb29wIG93bnMuICovXG5jb25zdCBNT1ZFTUVOVF9LRVlTID0gbmV3IFNldChbXCJ1cFwiLCBcImRvd25cIiwgXCJxXCIsIFwiYVwiXSk7XG5cbi8qKlxuICogUGhhc2VzIG9mIGEgZ2FtZS5cbiAqXG4gKiBgdGl0bGVgIGlzIHRoZSBvcmlnaW5hbCdzIGBhd2FpdCBnZXRjaCgpYCBiZWZvcmUgYG5vZGVsYXkoc3Rkc2NyLDEpYDpcbiAqIHRoZSBib2FyZCBpcyBwYWludGVkIGJ1dCBmcm96ZW4gdW50aWwgdGhlIGNhbGxlciBwcmVzc2VzIHNvbWV0aGluZy5cbiAqIGBwYXVzZWRgIGlzIHRoZSBvcmlnaW5hbCdzIGBub2RlbGF5KGZhbHNlKTsgYXdhaXQgZ2V0Y2goKTsgbm9kZWxheSh0cnVlKTtgLlxuICovXG50eXBlIFBvbmdQaGFzZSA9IFwidGl0bGVcIiB8IFwicGxheWluZ1wiIHwgXCJwYXVzZWRcIiB8IFwiZmluaXNoZWRcIjtcblxuLyoqXG4gKiBPbmUgdGljayBvZiB0aGUgZ2FtZSBsb29wLlxuICpcbiAqIE9yaWdpbmFsIEM6IHVzbGVlcCg0MDAwKSAtIDQwMDAgbWljcm9zZWNvbmRzID0gNG1zLlxuICogQkJTIG9wdGltaXNhdGlvbjogMzNtcyA9IH4zMGZwcywgbXVjaCBiZXR0ZXIgZm9yIG5ldHdvcmsvQ1BVLlxuICovXG5leHBvcnQgY29uc3QgUE9OR19USUNLX01TID0gMzM7XG5cbmV4cG9ydCBjbGFzcyBQb25nRG9vciB7XG4gIG5hbWUgPSBcIm5jdXJzZXMtcG9uZ1wiO1xuICB2ZXJzaW9uID0gXCIxLjAuMFwiO1xuICBhdXRob3IgPSBcIlZpY2VudGUgQm9sZWEgKG9yaWdpbmFsKSwgQW1pRXhwcmVzcyAocG9ydClcIjtcbiAgZGVzY3JpcHRpb24gPSBcIkNsYXNzaWMgUG9uZyAtIG5jdXJzZXMgcG9ydCB2YWxpZGF0aW9uXCI7XG5cbiAgcHJpdmF0ZSBwaGFzZTogUG9uZ1BoYXNlID0gXCJmaW5pc2hlZFwiO1xuICBwcml2YXRlIGxvb3A6IFJldHVyblR5cGU8dHlwZW9mIHNldEludGVydmFsPiB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHF1aXRDYWxsYmFjazogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgcHJpdmF0ZSBzY3JYID0gMDtcbiAgcHJpdmF0ZSBzY3JZID0gMDtcbiAgcHJpdmF0ZSBjb250ID0gMDtcblxuICAvKipcbiAgICogS2V5cyBoZWxkIHJpZ2h0IG5vdywgZnJvbSByZWFsIGtleS1kb3duL2tleS11cCBlZGdlcy5cbiAgICpcbiAgICogVGhlIGNsaWVudCdzIGdhbWUtbW9kZSBhdXRvLXJlcGVhdCB3YWl0cyA0MDAgbXMgYmVmb3JlIGl0IHN0YXJ0c1xuICAgKiAoYHBhY2thZ2VzL3Rlcm1pbmFsL3NyYy9jb21wb25lbnRzL0JCU1Rlcm1pbmFsLnRzeDoxMzQyYCksIHNvIGEgZG9vciB0aGF0XG4gICAqIG1vdmVzIG9uY2UgcGVyIGRlbGl2ZXJlZCBrZXkgc3R1dHRlcnMgb24gYSBoZWxkIGtleSBob3dldmVyIGZhc3QgdGhlIGdhbWVcbiAgICogbG9vcCBydW5zLiBFdmVyeSBhcmNhZGUgZG9vciBpbiB0aGlzIHJlcG8gYXZvaWRzIHRoYXQgdGhlIHNhbWUgd2F5IC0gaG9sZFxuICAgKiB0aGUga2V5IHN0YXRlLCBzdGVwIG9uY2UgcGVyIGZyYW1lIC0gYW5kIHRoaXMgaXMgdGhhdCBzdGF0ZS5cbiAgICovXG4gIHByaXZhdGUgaGVsZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cbiAgLyoqXG4gICAqIFRydWUgb25jZSBhIHJlYWwga2V5LWRvd24gZWRnZSBoYXMgYXJyaXZlZCwgaS5lLiB0aGlzIGNhbGxlcidzIHRyYW5zcG9ydFxuICAgKiBzZW5kcyBrZXkgZXZlbnRzIGF0IGFsbC4gVGVsbmV0IGRvZXMgbm90LCBhbmQgdGhlcmUgdGhlIGNoYXJhY3RlciBwYXRoXG4gICAqIGJlbG93IHN0YXlzIGluIGNoYXJnZS5cbiAgICovXG4gIHByaXZhdGUga2V5RWRnZXMgPSBmYWxzZTtcblxuICBwcml2YXRlIGIxOiBHYW1lT2JqZWN0ID0gbmV3T2JqZWN0KCk7IC8vIHBsYXllciAxIHBhZGRsZSAocmlnaHQpXG4gIHByaXZhdGUgYjI6IEdhbWVPYmplY3QgPSBuZXdPYmplY3QoKTsgLy8gcGxheWVyIDIgcGFkZGxlIChsZWZ0KVxuICBwcml2YXRlIGJhbGw6IEdhbWVPYmplY3QgPSBuZXdPYmplY3QoKTtcblxuICAvKipcbiAgICogSW5pdGlhbGlzZSBuY3Vyc2VzLCBwYWludCB0aGUgdGl0bGUgc2NyZWVuLCBwYXJrIHRoZSBnYW1lIGxvb3AsIFJFVFVSTi5cbiAgICpcbiAgICogUmV0dXJuaW5nIGlzIHRoZSB3aG9sZSBwb2ludDogYERvb3IuZXhlY3V0ZSgpYCBvbmx5IHJlYWNoZXMgdGhlIFNESyBpbnB1dFxuICAgKiBsb29wIC0gdGhlIG9uZSB0aGluZyB0aGF0IGluc3RhbGxzIGBiYnNTZXNzaW9uLmRvb3JJbnB1dEhhbmRsZXJgIC0gYWZ0ZXJcbiAgICogZXZlcnkgc3RhcnQgaGFuZGxlciBoYXMgcmVzb2x2ZWQgKHNkay9zcmMvY29yZS9Eb29yLnRzOjExOC0xMzEsIDoyNTApLlxuICAgKlxuICAgKiBAcGFyYW0gY29udGV4dCAtIHRoZSBuY3Vyc2VzIEkvTyBjb250ZXh0IChhbnl0aGluZyB3aXRoIGBlbWl0YC9gd3JpdGVgKVxuICAgKiBAcGFyYW0gb25RdWl0ICAtIGNhbGxlZCBvbmNlLCB3aGVuIHRoZSBwbGF5ZXIgaGFzIHByZXNzZWQgRVNDXG4gICAqL1xuICBzdGFydChjb250ZXh0OiB1bmtub3duLCBvblF1aXQ6ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICB0aGlzLnF1aXRDYWxsYmFjayA9IG9uUXVpdDtcblxuICAgIC8vIE9yaWdpbmFsIEM6IGluaXRzY3IoKTsgc3RhcnRfY29sb3IoKTsgaW5pdF9wYWlyKDEsQ09MT1JfQkxVRSxDT0xPUl9CTEFDSyk7XG4gICAgaW5pdHNjcihjb250ZXh0KTtcbiAgICBzdGFydF9jb2xvcigpO1xuICAgIGluaXRfcGFpcigxLCBDT0xPUl9CTFVFLCBDT0xPUl9CTEFDSyk7XG5cbiAgICAvLyBPcmlnaW5hbCBDOiBrZXlwYWQoc3Rkc2NyLHRydWUpOyBub2VjaG8oKTsgY3Vyc19zZXQoMCk7XG4gICAgY29uc3Qgc3Rkc2NyID0gZ2V0U3Rkc2NyKCk7XG4gICAgaWYgKHN0ZHNjcikge1xuICAgICAga2V5cGFkKHN0ZHNjciwgdHJ1ZSk7XG4gICAgfVxuICAgIG5vZWNobygpO1xuICAgIGN1cnNfc2V0KDApO1xuXG4gICAgLy8gT3JpZ2luYWwgQzogZ2V0bWF4eXgoc3Rkc2NyLHNjci55LHNjci54KTtcbiAgICB0aGlzLnNjclkgPSBnZXRMSU5FUygpO1xuICAgIHRoaXMuc2NyWCA9IGdldENPTFMoKTtcblxuICAgIC8vIE9yaWdpbmFsIEM6IG9iamVjdCBiMT17c2NyLngtMixzY3IueS8yLDAsZmFsc2UsZmFsc2V9LCAuLi5cbiAgICB0aGlzLmIxID0geyB4OiB0aGlzLnNjclggLSAyLCB5OiBNYXRoLmZsb29yKHRoaXMuc2NyWSAvIDIpLCBjOiAwLCBtb3Zob3I6IGZhbHNlLCBtb3Z2ZXI6IGZhbHNlIH07XG4gICAgdGhpcy5iMiA9IHsgeDogMSwgeTogTWF0aC5mbG9vcih0aGlzLnNjclkgLyAyKSwgYzogMCwgbW92aG9yOiBmYWxzZSwgbW92dmVyOiBmYWxzZSB9O1xuICAgIHRoaXMuYmFsbCA9IHtcbiAgICAgIHg6IE1hdGguZmxvb3IodGhpcy5zY3JYIC8gMiksXG4gICAgICB5OiBNYXRoLmZsb29yKHRoaXMuc2NyWSAvIDIpLFxuICAgICAgYzogMCxcbiAgICAgIG1vdmhvcjogZmFsc2UsXG4gICAgICBtb3Z2ZXI6IGZhbHNlLFxuICAgIH07XG4gICAgdGhpcy5jb250ID0gMDtcblxuICAgIC8vIFNob3cgdGl0bGUgc2NyZWVuXG4gICAgbXZwcmludHcoXG4gICAgICA0LFxuICAgICAgMCxcbiAgICAgIFwiXFx0ICAgICAgICAgICBvb29vb29vb29vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgICAgICAgICAgIDg4OCAgICA4ODggIG9vb29vb28gICAgb29vb29vbyAgICBvb29vb29vbzggICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCAgICAgICAgICAgODg4b29vbzg4IDg4OCAgICAgODg4IDg4OCAgIDg4OCAgODg4ICAgIDg4byAgICAgICBcXG5cIiArXG4gICAgICAgIFwiXFx0ICAgICAgICAgICA4ODggICAgICAgODg4ICAgICA4ODggODg4ICAgODg4ICAgODg4b284ODhvICAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgICAgICAgICAgbzg4OG8gICAgICAgIDg4b29vODggIG84ODhvIG84ODhvIDg4OCAgICAgODg4ICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDg4OG9vbzg4OCAgICAgXFxuXFxuXCIgK1xuICAgICAgICBcIlxcdCBPcmlnaW5hbCBieSBWaWNlbnRlIEJvbGVhIC0gUG9ydGVkIHRvIEFtaUV4cHJlc3MgbmN1cnNlcyAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgXFx0XFx0XFx0UGxheWVyIDEgY29udHJvbHM6IFVQL0RPV04gYXJyb3dzICAgICAgICAgICAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgXFx0XFx0XFx0UGxheWVyIDIgY29udHJvbHM6IFEgKHVwKSBhbmQgQSAoZG93bikgICAgICAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgXFx0XFx0XFx0UHJlc3MgQU5ZIGtleSB0byBzdGFydCwgUCBmb3IgcGF1c2UsIEVTQyB0byBxdWl0XCJcbiAgICApO1xuXG4gICAgcmVmcmVzaCgpOyAvLyBDUklUSUNBTDogRmx1c2ggb3V0cHV0IHRvIHRlcm1pbmFsIGJlZm9yZSB3YWl0aW5nIGZvciBpbnB1dFxuICAgIHRoaXMucGhhc2UgPSBcInRpdGxlXCI7XG5cbiAgICAvLyBUaGUgbG9vcCB0aGlzIGRvb3Igb3ducy4gSXQgcnVucyBmcm9tIHRoZSB0aXRsZSBzY3JlZW4gb24gc28gdGhhdCB0aGVcbiAgICAvLyBnYW1lIGhhcyBhIGhlYXJ0YmVhdCBvZiBpdHMgb3duIHRoZSBtb21lbnQgdGhlIGNhbGxlciBzdGFydHMgaXQsIGFuZCBpdFxuICAgIC8vIGlzIGNsZWFyZWQgaW4gc3RvcCgpLlxuICAgIHRoaXMubG9vcCA9IHNldEludGVydmFsKCgpID0+IHRoaXMudGljaygpLCBQT05HX1RJQ0tfTVMpO1xuICB9XG5cbiAgLyoqXG4gICAqIE9uZSBpdGVyYXRpb24gb2YgdGhlIG9yaWdpbmFsIGBmb3IgKG5vZGVsYXkoc3Rkc2NyLDEpOyAhZW5kOyB1c2xlZXAoNDAwMCkpYFxuICAgKiBib2R5LCBtaW51cyB0aGUgYGdldGNoKClgIChrZXlzIGFycml2ZSB0aHJvdWdoIGhhbmRsZUtleSBub3cpLlxuICAgKi9cbiAgdGljaygpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5waGFzZSAhPT0gXCJwbGF5aW5nXCIpIHJldHVybjtcblxuICAgIGNvbnN0IHsgYjEsIGIyLCBiYWxsOiBiIH0gPSB0aGlzO1xuICAgIGNvbnN0IHNjclggPSB0aGlzLnNjclg7XG4gICAgY29uc3Qgc2NyWSA9IHRoaXMuc2NyWTtcblxuICAgIC8vIE1vdmVtZW50IGNvbWVzIGZyb20gdGhlIGhlbGQga2V5cywgb25jZSBwZXIgZnJhbWUgLSBBcmthbm9pZCdzIGNhZGVuY2UsXG4gICAgLy8gYW5kIHdoYXQgYERvb3JJbnB1dE1hbmFnZXIuY29uc3VtZVJlcGVhdGAgZ2l2ZXMgd2l0aCBpdHMgZGVmYXVsdHNcbiAgICAvLyAoYHNkay91dGlscy9kb29yLWlucHV0LW1hbmFnZXIudHM6MzIyLTM0MGApLiBObyBjbGllbnQgYXV0by1yZXBlYXQgaXNcbiAgICAvLyBpbnZvbHZlZCwgc28gdGhlcmUgaXMgbm8gNDAwIG1zIGhlc2l0YXRpb24gYmVmb3JlIHRoZSBwYWRkbGUgbW92ZXMuXG4gICAgdGhpcy5zdGVwSGVsZFBhZGRsZXMoKTtcblxuICAgIC8vIE9yaWdpbmFsIEM6IGlmICgrK2NvbnQlMTY9PTApXG4gICAgLy8gQWRqdXN0IGdhbWUgbG9naWMgdG8gbWF0Y2ggbmV3IHRpY2sgcmF0ZSAod2FzIDE2IHRpY2tzIEAgNG1zID0gNjRtcykuXG4gICAgLy8gV2l0aCAzM21zIHRpY2tzLCB3ZSB1cGRhdGUgZXZlcnkgMiB0aWNrcyAofjY2bXMpLlxuICAgIHRoaXMuY29udCsrO1xuICAgIGlmICh0aGlzLmNvbnQgJSAyID09PSAwKSB7XG4gICAgICAvLyBCYWxsIHZlcnRpY2FsIGJvdW5jZVxuICAgICAgaWYgKGIueSA9PT0gc2NyWSAtIDEgfHwgYi55ID09PSAxKSB7XG4gICAgICAgIGIubW92dmVyID0gIWIubW92dmVyO1xuICAgICAgfVxuXG4gICAgICAvLyBCYWxsIGhvcml6b250YWwgYm91bmNlIChwYWRkbGUgY29sbGlzaW9uKVxuICAgICAgaWYgKGIueCA+PSBzY3JYIC0gMiB8fCBiLnggPD0gMikge1xuICAgICAgICBiLm1vdmhvciA9ICFiLm1vdmhvcjtcblxuICAgICAgICBpZiAoYi55ID09PSBiMS55IC0gMSB8fCBiLnkgPT09IGIyLnkgLSAxKSB7XG4gICAgICAgICAgYi5tb3Z2ZXIgPSBmYWxzZTtcbiAgICAgICAgfSBlbHNlIGlmIChiLnkgPT09IGIxLnkgKyAxIHx8IGIueSA9PT0gYjIueSArIDEpIHtcbiAgICAgICAgICBiLm1vdnZlciA9IHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAoYi55ICE9PSBiMS55ICYmIGIueSAhPT0gYjIueSkge1xuICAgICAgICAgIC8vIFNjb3JlIVxuICAgICAgICAgIGlmIChiLnggPj0gc2NyWCAtIDIpIHtcbiAgICAgICAgICAgIGIxLmMrKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYjIuYysrO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBSZXNldCBiYWxsXG4gICAgICAgICAgYi54ID0gTWF0aC5mbG9vcihzY3JYIC8gMik7XG4gICAgICAgICAgYi55ID0gTWF0aC5mbG9vcihzY3JZIC8gMik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gTW92ZSBiYWxsXG4gICAgICBiLnggPSBiLm1vdmhvciA/IGIueCArIDEgOiBiLnggLSAxO1xuICAgICAgYi55ID0gYi5tb3Z2ZXIgPyBiLnkgKyAxIDogYi55IC0gMTtcblxuICAgIH1cblxuICAgIC8vIE9yaWdpbmFsIEMgd3JhcHBlZCB0aGUgcGFkZGxlcyBpbnNpZGUgdGhlIHBoeXNpY3MgdGljazsgdGhleSBjYW4gbm93XG4gICAgLy8gbW92ZSBvbiBhbnkgZnJhbWUsIHNvIHRoZSB3cmFwIHJ1bnMgb24gYW55IGZyYW1lIHRvbyAtIG90aGVyd2lzZSBhIGhlbGRcbiAgICAvLyBrZXkgY2FuIHdhbGsgYSBwYWRkbGUgb2ZmIHRoZSBib2FyZCBmb3IgYSBmcmFtZSBiZWZvcmUgaXQgaXMgY2F1Z2h0LlxuICAgIGlmIChiMS55IDw9IDEpIGIxLnkgPSBzY3JZIC0gMjtcbiAgICBpZiAoYjEueSA+PSBzY3JZIC0gMSkgYjEueSA9IDI7XG4gICAgaWYgKGIyLnkgPD0gMSkgYjIueSA9IHNjclkgLSAyO1xuICAgIGlmIChiMi55ID49IHNjclkgLSAxKSBiMi55ID0gMjtcblxuICAgIHRoaXMuZHJhdygpO1xuICB9XG5cbiAgLyoqXG4gICAqIEEgcmVhbCBrZXktZG93biBlZGdlLCBmcm9tIGBiYnMub25LZXlEb3duYC5cbiAgICpcbiAgICogVGhlIGNsaWVudCByZS1zZW5kcyBrZXktZG93biB3aGlsZSBhIGtleSBhdXRvLXJlcGVhdHM7IG9ubHkgdGhlIGZpcnN0XG4gICAqIGVkZ2UgbWF0dGVycywgYW5kIGBTZXQuYWRkYCBtYWtlcyB0aGF0IGZyZWUuXG4gICAqL1xuICBob2xkS2V5KGtleTogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy5rZXlFZGdlcyA9IHRydWU7XG4gICAgdGhpcy5oZWxkLmFkZChub3JtYWxpc2VLZXlOYW1lKGtleSkpO1xuICB9XG5cbiAgLyoqIEEgcmVhbCBrZXktdXAgZWRnZSwgZnJvbSBgYmJzLm9uS2V5VXBgLiAqL1xuICByZWxlYXNlS2V5KGtleTogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy5oZWxkLmRlbGV0ZShub3JtYWxpc2VLZXlOYW1lKGtleSkpO1xuICB9XG5cbiAgLyoqIE9yaWdpbmFsIEM6IHRoZSBLRVlfVVAgLyBLRVlfRE9XTiAvIFEgLyBBIGFybXMgb2YgYHN3aXRjaCAoZ2V0Y2goKSlgLiAqL1xuICBwcml2YXRlIHN0ZXBIZWxkUGFkZGxlcygpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMua2V5RWRnZXMpIHJldHVybjtcbiAgICBpZiAodGhpcy5oZWxkLmhhcyhcInVwXCIpKSB0aGlzLmIxLnktLTtcbiAgICBpZiAodGhpcy5oZWxkLmhhcyhcImRvd25cIikpIHRoaXMuYjEueSsrO1xuICAgIGlmICh0aGlzLmhlbGQuaGFzKFwicVwiKSkgdGhpcy5iMi55LS07XG4gICAgaWYgKHRoaXMuaGVsZC5oYXMoXCJhXCIpKSB0aGlzLmIyLnkrKztcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgb3JpZ2luYWwgYHN3aXRjaCAoZ2V0Y2goKSlgLCBkcml2ZW4gYnkgdGhlIGNhbGxlcidzIGtleXN0cm9rZS5cbiAgICpcbiAgICogQHBhcmFtIG5hbWUgLSBhIGtleSBuYW1lIGFzIHBhcnNlZCBvZmYgdGhlIHdpcmU6IFwidXBcIiwgXCJkb3duXCIsIFwiZXNjYXBlXCIsXG4gICAqICAgICAgICAgICAgICAgb3IgdGhlIGNoYXJhY3RlciBpdHNlbGYuXG4gICAqL1xuICBoYW5kbGVLZXkobmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgaWYgKHRoaXMucGhhc2UgPT09IFwiZmluaXNoZWRcIikgcmV0dXJuO1xuXG4gICAgLy8gT3JpZ2luYWwgQzogdGhlIGBhd2FpdCBnZXRjaCgpYCB1bmRlciB0aGUgdGl0bGUgc2NyZWVuLCBhbmQgdGhlXG4gICAgLy8gYG5vZGVsYXkoZmFsc2UpOyBhd2FpdCBnZXRjaCgpOyBub2RlbGF5KHRydWUpO2Agb2YgdGhlIHBhdXNlIC0gYm90aCBhcmVcbiAgICAvLyBcImFueSBrZXkgY29udGludWVzXCIuXG4gICAgaWYgKHRoaXMucGhhc2UgPT09IFwidGl0bGVcIiB8fCB0aGlzLnBoYXNlID09PSBcInBhdXNlZFwiKSB7XG4gICAgICB0aGlzLnBoYXNlID0gXCJwbGF5aW5nXCI7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSW4gZ2FtZSBtb2RlIGEga2V5LWRvd24gcmVhY2hlcyB0aGUgZG9vciBvbiBCT1RIIHBhdGhzIC0gdGhlIGtleS1zdGF0ZVxuICAgIC8vIGhhbmRsZXIgYXQgYHNvY2tldC1oYW5kbGVycy50czo1MjdgIGFuZCB0aGUgaW5wdXQgaGFuZGxlciBhdCA6NTM2IC0gc29cbiAgICAvLyBvbmNlIHJlYWwgZWRnZXMgYXJlIGFycml2aW5nLCBtb3ZlbWVudCBiZWxvbmdzIHRvIHRoZSBoZWxkLWtleSBsb29wXG4gICAgLy8gYWxvbmUuIEFjdGluZyBoZXJlIGFzIHdlbGwgd291bGQgc3RlcCB0aGUgcGFkZGxlIHR3aWNlIHBlciBwcmVzc1xuICAgIC8vIChgc2RrL3V0aWxzL2Rvb3ItaW5wdXQtbWFuYWdlci50czoyODctMjkyYCBzYXlzIHRoZSBzYW1lKS5cbiAgICBpZiAodGhpcy5rZXlFZGdlcyAmJiBNT1ZFTUVOVF9LRVlTLmhhcyhuYW1lKSkgcmV0dXJuO1xuXG4gICAgc3dpdGNoIChuYW1lKSB7XG4gICAgICBjYXNlIFwiZG93blwiOlxuICAgICAgICB0aGlzLmIxLnkrKztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidXBcIjpcbiAgICAgICAgdGhpcy5iMS55LS07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInFcIjpcbiAgICAgIGNhc2UgXCJRXCI6XG4gICAgICAgIHRoaXMuYjIueS0tO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJhXCI6XG4gICAgICBjYXNlIFwiQVwiOlxuICAgICAgICB0aGlzLmIyLnkrKztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwicFwiOlxuICAgICAgY2FzZSBcIlBcIjpcbiAgICAgICAgLy8gUGF1c2UgLSB3YWl0IGZvciBhbnkga2V5XG4gICAgICAgIHRoaXMucGhhc2UgPSBcInBhdXNlZFwiO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJlc2NhcGVcIjpcbiAgICAgICAgdGhpcy5xdWl0KCk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wIHRoZSBnYW1lIGxvb3AgYW5kIGxlYXZlIG5jdXJzZXMgbW9kZS4gSWRlbXBvdGVudDogdGhlIGRvb3IgY2FsbHMgaXRcbiAgICogZnJvbSBpdHMgY2xvc2UgaGFuZGxlciBhcyB3ZWxsIGFzIGZyb20gdGhlIEVTQyBwYXRoLCBhbmQgYGVuZHdpbigpYCBwdXRzXG4gICAqIHJlYWwgYnl0ZXMgb24gdGhlIHdpcmUgKHNob3cgY3Vyc29yLCByZXNldCBhdHRyaWJ1dGVzLCBsZWF2ZSB0aGUgYWx0ZXJuYXRlXG4gICAqIHNjcmVlbikuIFRoZSBwaGFzZSBndWFyZCBpcyB3aGF0IG1ha2VzIHRoZSBzZWNvbmQgY2FsbCBhIG5vLW9wIEhFUkUsXG4gICAqIHJhdGhlciB0aGFuIGxlYW5pbmcgb24gYGVuZHdpbigpYCdzIG93biBgaW5pdGlhbGl6ZWRgIGNoZWNrXG4gICAqIChgc2RrL2VuZ2luZXMvdWkvbmN1cnNlcy9uY3Vyc2VzLnRzOjI0Ni0yNDlgKSB0byBzd2FsbG93IGl0LlxuICAgKi9cbiAgc3RvcCgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5waGFzZSA9PT0gXCJmaW5pc2hlZFwiKSByZXR1cm47XG4gICAgaWYgKHRoaXMubG9vcCkge1xuICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmxvb3ApO1xuICAgICAgdGhpcy5sb29wID0gbnVsbDtcbiAgICB9XG4gICAgdGhpcy5waGFzZSA9IFwiZmluaXNoZWRcIjtcbiAgICB0aGlzLmhlbGQuY2xlYXIoKTtcbiAgICB0aGlzLmtleUVkZ2VzID0gZmFsc2U7XG4gICAgZW5kd2luKCk7XG4gIH1cblxuICAvKiogT3JpZ2luYWwgQzogYGVuZCA9IHRydWU7YCBhbmQgdGhlIGBlbmR3aW4oKWAgYWZ0ZXIgdGhlIGxvb3AuICovXG4gIHByaXZhdGUgcXVpdCgpOiB2b2lkIHtcbiAgICBjb25zdCBvblF1aXQgPSB0aGlzLnF1aXRDYWxsYmFjaztcbiAgICB0aGlzLnF1aXRDYWxsYmFjayA9IG51bGw7XG4gICAgdGhpcy5zdG9wKCk7XG4gICAgaWYgKG9uUXVpdCkgb25RdWl0KCk7XG4gIH1cblxuICAvKiogVGhlIGRyYXdpbmcgaGFsZiBvZiB0aGUgb3JpZ2luYWwgbG9vcCBib2R5LiAqL1xuICBwcml2YXRlIGRyYXcoKTogdm9pZCB7XG4gICAgY29uc3QgeyBiMSwgYjIsIGJhbGw6IGIgfSA9IHRoaXM7XG4gICAgY29uc3Qgc2NyWCA9IHRoaXMuc2NyWDtcbiAgICBjb25zdCBzY3JZID0gdGhpcy5zY3JZO1xuXG4gICAgZXJhc2UoKTtcblxuICAgIC8vIFNjb3JlIGRpc3BsYXlcbiAgICBtdnByaW50dygyLCBNYXRoLmZsb29yKHNjclggLyAyKSAtIDIsIGAke2IxLmN9IHwgJHtiMi5jfWApO1xuXG4gICAgLy8gQ2VudGVyIGxpbmVcbiAgICBtdnZsaW5lKDAsIE1hdGguZmxvb3Ioc2NyWCAvIDIpLCBBQ1NfVkxJTkUsIHNjclkpO1xuXG4gICAgLy8gQmFsbCBhbmQgcGFkZGxlcyBpbiBibHVlXG4gICAgYXR0cm9uKENPTE9SX1BBSVIoMSkpO1xuICAgIG12cHJpbnR3KGIueSwgYi54LCBcIm9cIik7XG4gICAgZm9yIChsZXQgaSA9IC0xOyBpIDwgMjsgaSsrKSB7XG4gICAgICBtdnByaW50dyhiMS55ICsgaSwgYjEueCwgXCJ8XCIpO1xuICAgICAgbXZwcmludHcoYjIueSArIGksIGIyLngsIFwifFwiKTtcbiAgICB9XG4gICAgYXR0cm9mZihDT0xPUl9QQUlSKDEpKTtcblxuICAgIHJlZnJlc2goKTsgLy8gQ1JJVElDQUw6IFNlbmQgdGhlIHVwZGF0ZWQgYnVmZmVyIHRvIHRoZSB0ZXJtaW5hbCFcbiAgfVxufVxuIl19