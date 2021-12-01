const PIXELS_PER_SQUARE = 20;

class Level {
    constructor(plan) {
        let rows = plan.trim().split("\n").map(row => [...row]);

        this.height = rows.length;
        this.width = rows[0].length;
        this.startActors = [];
        this.rows = rows.map((row, y) => {
            return row.map((char, x) => {
                let type = LEVEL_CHARACTERS[char];
                if (typeof type === "string") return type;
                this.startActors.push(type.create(new Vector(x, y), char));
                return "empty";
            });
        });
    }
}

Level.prototype.touches = function (position, size, type) {
    const startX = Math.floor(position.x);
    const startY = Math.floor(position.y);
    const endX = Math.ceil(position.x + size.x); // Up to but not including endX
    const endY = Math.ceil(position.y + size.y);

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const atTheEdge = x < 0 || y < 0 || x >= this.width || y >= this.height;
            const touchingSurface = atTheEdge ? "wall" : this.rows[y][x]
            if (touchingSurface === type) return true;
        }
    }
    return false;
}

class State {
    constructor(level, actors, status) {
        this.level = level;
        this.actors = actors;
        this.status = status;
    }

    static start(level) {
        return new State(level, level.startActors, "playing");
    }

    get player() {
        return this.actors.find(a => a.type === "player");
    }
}

State.prototype.update = function (time, keys) {
    const actors = this.actors.map(actor => actor.update(time, this, keys));
    let newState = new State(this.level, actors, this.status);

    if (newState.status !== "playing") return newState;

    const player = newState.player;
    if (this.level.touches(player.position, player.size, "lava")) {
        return new State(this.level, actors, "lost");
    }

    for (const actor of actors) {
        if (actor !== player && overlap(actor, player)) {
            newState = actor.collide(newState);
        }
    }
    return newState;
};

class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    plus(anotherVector) {
        return new Vector(this.x + anotherVector.x, this.y + anotherVector.y);
    }

    times(factor) {
        return new Vector(this.x * factor, this.y * factor);
    }
}

class Player {
    constructor(position, velocity) {
        this.position = position;
        this.velocity = velocity;
    }

    get type() {
        return "player";
    }

    static create(position) {
        // The Player actor is 1.5 squares tall, so it's top left corner is half a square above the square it occupies.
        // The Player actor starts off stationary
        const newPosition = position.plus(new Vector(0, -0.5));
        return new Player(
            newPosition,
            new Vector(0, 0)
        );
    }
}

Player.prototype.size = new Vector(0.8, 1.5); // The Player actor is 1.5 squares tall and 0.8 squares wide

Player.prototype.maxVelocity = new Vector(10, -20);

Player.prototype.gravitationalAcceleration = 30;

Player.prototype.update = function (time, state, keys) {
    let horizontalVelocity = 0;
    if (keys.ArrowLeft) horizontalVelocity -= this.maxVelocity.x;
    if (keys.ArrowRight) horizontalVelocity += this.maxVelocity.x;
    let newPosition = this.position.plus(new Vector(horizontalVelocity * time, 0));

    // I don't understand this code!!!! 
    // - Explanation: When the player is standing on a "wall", it isn't actually touching it.
    // In other words, it approaches the wall until the point where its NEXT STEP would cause it to overlap with the wall
    // At that point, the Player object stops. Hence, there is no overlap.
    if (state.level.touches(newPosition, this.size, "wall")) {
        newPosition = this.position;
    }

    let verticalVelocity = this.velocity.y + this.gravitationalAcceleration * time;
    let newNewPosition = newPosition.plus(new Vector(0, verticalVelocity * time));
    if (state.level.touches(newNewPosition, this.size, "wall")) { // Read line 133
        newNewPosition = newPosition;
        if (verticalVelocity > 0 && keys.ArrowUp) { // Standing on a wall and ArrowUp is pressed
            verticalVelocity = this.maxVelocity.y;
        } else {
            verticalVelocity = 0;
        }
    }


    return new Player(newNewPosition, new Vector(horizontalVelocity, verticalVelocity));
}

class Lava {
    constructor(position, velocity, reset) {
        this.position = position;
        this.velocity = velocity;
        this.reset = reset;
    }

    get type() {
        return "lava";
    }

    static create(position, character) {
        if (character === "=") {
            return new Lava(position, new Vector(2, 0));
        } else if (character === "|") {
            return new Lava(position, new Vector(0, 2));
        } else if (character === "v") {
            return new Lava(position, new Vector(0, 3), position);
        }
    }
}

Lava.prototype.size = new Vector(1, 1);

Lava.prototype.collide = function (state) {
    return new State(state.level, state.actors, "lost");
};

Lava.prototype.update = function (time, state) {
    const newPosition = this.position.plus(this.velocity.times(time));
    if (!state.level.touches(newPosition, this.size, "wall")) {
        return new Lava(newPosition, this.velocity, this.reset);
    } else if (this.reset) {
        return new Lava(this.reset, this.velocity, this.reset);
    } else {
        return new Lava(this.position, this.velocity.times(-1));
    }
};

class Monster {
    constructor(position) {
        this.position = position;
    }

    get type() {
        return "monster";
    }

    static create(position) {
        return new Monster(position.plus(new Vector(0, -1)));
    }
}

Monster.prototype.speed = 3;

Monster.prototype.update = function(time, state) {
    const targetX = state.player.position.x;

    const speed = (this.position.x > targetX ? -1 : 1) * this.speed;

    const newPosition = this.position.plus(new Vector(speed * time, 0));

    if (state.level.touches(newPosition, this.size, "wall")) return this;

    return new Monster(newPosition);
}

Monster.prototype.collide = function(state) {
    const player = state.player;

    if (player.position.y + player.size.y < this.position.y + 0.5) {
        const filtered = state.actors.filter(actor => actor != this);
        return new State(state.level, filtered, state.status);
    }

    return new State(state.level, state.actors, "lost");
}

Monster.prototype.size = new Vector(1.2, 2);


class Coin {
    constructor(position, basePosition, radians) {
        this.position = position;
        this.basePosition = basePosition;
        this.radians = radians;
    }

    get type() {
        return "coin";
    }

    static create(position) {
        const basePosition = position.plus(new Vector(0.2, 0.1));
        return new Coin(basePosition, basePosition, Math.random() * Math.PI * 2)
    }
}

Coin.prototype.size = new Vector(0.6, 0.6);

Coin.prototype.collide = function (state) {
    const filtered = state.actors.filter(actor => actor !== this);
    let status = state.status;
    if (!filtered.some(actor => actor.type === "coin")) status = "won";
    return new State(state.level, filtered, status);
};

Coin.prototype.angularVelocity = 8; // One cycle per second
Coin.prototype.maxDisplacement = 0.07; // Maximum distance it can move from the basePosition

Coin.prototype.update = function (time) {
    const newRadians = this.radians + this.angularVelocity * time;
    const displacement = Math.sin(newRadians) * this.maxDisplacement;
    const displacementVector = new Vector(0, displacement);
    return new Coin(this.basePosition.plus(displacementVector), this.basePosition, newRadians);
};

const LEVEL_CHARACTERS = {
    ".": "empty", "#": "wall", "+": "lava",
    "@": Player, "o": Coin, "=": Lava,
    "|": Lava, "v": Lava, "M": Monster
};


function createElement(tagName, attributes, ...children) {
    const element = document.createElement(tagName);

    for (const attribute of Object.keys(attributes)) {
        element.setAttribute(attribute, attributes[attribute]);
    }
    for (const child of children) {
        element.appendChild(child);
    }
    return element;
}

class CanvasDisplay {
    constructor(parent, level) {
        this.canvas = document.createElement("canvas");
        this.canvas.width = Math.min(600, level.width * PIXELS_PER_SQUARE);
        this.canvas.height = Math.min(450, level.height * PIXELS_PER_SQUARE);
        parent.appendChild(this.canvas);
        this.cx = this.canvas.getContext("2d");

        this.flipPlayer = false;

        this.viewport = {
            left: 0,
            top: 0,
            width: this.canvas.width / PIXELS_PER_SQUARE,
            height: this.canvas.height / PIXELS_PER_SQUARE,
        };
    }

    clear() {
        this.canvas.remove();
    }
}

CanvasDisplay.prototype.displayState = function(state) {
    this.updateViewport(state);
    this.clearDisplay(state.status);
    this.drawBackground(state.level);
    this.drawActors(state.actors);
};

CanvasDisplay.prototype.updateViewport = function(state) {
    let view = this.viewport, margin = view.width / 3;
    let player = state.player;
    let center = player.position.plus(player.size.times(0.5));

    if (center.x < view.left + margin) {
        view.left = Math.max(center.x - margin, 0);
    } else if (center.x > view.left + view.width - margin) {
        view.left = Math.min(center.x + margin - view.width, state.level.width - view.width);
    }

    if (center.y < view.top + margin) {
        view.top = Math.max(center.y - margin, 0);
    } else if (center.y > view.top + view.height - margin) {
        view.top = Math.min(center.y + margin - view.height, state.level.height - view.height);
    }
};

CanvasDisplay.prototype.clearDisplay = function(status) {
    if (status == "won") {
        this.cx.fillStyle = "rgb(68, 191, 255)";
    } else if (status == "lost") {
        this.cx.fillStyle = "rgb(44, 136, 214)";
    } else {
        this.cx.fillStyle = "rgb(52, 166, 251)";
    }
    this.cx.fillRect(0, 0, this.canvas.width, this.canvas.height);
}

let otherSprites = document.createElement("img");
otherSprites.src = "sprites.png";

CanvasDisplay.prototype.drawBackground = function(level) {
    let {left, top, width, height} = this.viewport;
    let xStart = Math.floor(left);
    let xEnd = Math.ceil(left + width);
    let yStart = Math.floor(top);
    let yEnd = Math.ceil(top + height);

    for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
            let tile = level.rows[y][x];
            if (tile == "empty") continue;
            let screenX = (x - left) * PIXELS_PER_SQUARE;
            let screenY = (y - top) * PIXELS_PER_SQUARE;
            let tileX = tile == "lava" ? PIXELS_PER_SQUARE : 0;
            this.cx.drawImage(otherSprites, tileX, 0, PIXELS_PER_SQUARE, PIXELS_PER_SQUARE, screenX, screenY, PIXELS_PER_SQUARE, PIXELS_PER_SQUARE);
        }
    }
};

let playerSprites = document.createElement("img");
playerSprites.src = "player.png"
const playerXOverlap = 4;

function flipHorizontally(cx, axis) {
    cx.translate(axis, 0);
    cx.scale(-1, 1);
    cx.translate(-axis, 0)
}

CanvasDisplay.prototype.drawPlayer = function(player, x, y, width, height) {
    width += playerXOverlap * 2;
    x -= playerXOverlap;
    if (player.velocity.x != 0) {
        this.flipPlayer = player.velocity.x < 0;
    }

    let tile = 8;
    if (player.velocity.y != 0) {
        tile = 9;
    } else if (player.velocity.x != 0) {
        tile = Math.floor(Date.now() / 60) % 8;
    }

    this.cx.save();
    if (this.flipPlayer) {
        flipHorizontally(this.cx, x + width / 2);
    }
    let tileX = tile * width;
    this.cx. drawImage(playerSprites, tileX, 0, width, height, x, y, width, height);
    this.cx.restore();
}

CanvasDisplay.prototype.drawActors = function(actors) {
    for (let actor of actors) {
        let width = actor.size.x * PIXELS_PER_SQUARE;
        let height = actor.size.y * PIXELS_PER_SQUARE;
        let x = (actor.position.x - this.viewport.left) * PIXELS_PER_SQUARE;
        let y = (actor.position.y - this.viewport.top) * PIXELS_PER_SQUARE;
        if (actor.type == "player") {
            this.drawPlayer(actor, x, y, width, height);
        } else {
            let tileX = (actor.type == "coin" ? 2 : 1) * PIXELS_PER_SQUARE;
            this.cx.drawImage(otherSprites, tileX, 0, width, height, x, y, width, height);
        }
    }
};

class DOMDisplay {
    constructor(parent, level) {
        this.element = createElement("div", { class: "game" }, drawGrid(level));
        this.actorLayer = null;
        parent.appendChild(this.element);
    }

    clear() {
        this.element.remove();
    }
}

DOMDisplay.prototype.displayState = function (state) {
    if (this.actorLayer) this.actorLayer.remove();
    this.actorLayer = drawActors(state.actors);
    this.element.appendChild(this.actorLayer);
    this.element.className = `game ${state.status}`;
    this.scrollPlayerIntoView(state);
}

DOMDisplay.prototype.scrollPlayerIntoView = function (state) {
    const width = this.element.clientWidth;
    const height = this.element.clientHeight;
    const margin = width / 3; // Divides up the width into three equal sections, player remains in the middle third

    const left = this.element.scrollLeft;
    const right = left + width;
    const top = this.element.scrollTop;
    const bottom = top + height;

    const player = state.player;
    const center = player.position.plus(player.size.times(0.5)).times(PIXELS_PER_SQUARE);

    if (center.x < left + margin) {
        this.element.scrollLeft = center.x - margin;
    } else if (center.x > right - margin) {
        this.element.scrollLeft = center.x + margin - width;
    }
    if (center.y < top + margin) {
        this.element.scrollTop = center.y - margin;
    } else if (center.y > bottom - margin) {
        this.element.scrollTop = center.y + margin - height;
    }

}


function drawGrid(level) {
    const rowElements = level.rows.map(row => {
        const cellElements = row.map(cellType => createElement("td", { class: cellType }));
        return createElement("tr", { style: `height: ${PIXELS_PER_SQUARE}px` }, ...cellElements);
    });

    const tableAttributes = {
        class: "background",
        style: `width: ${level.width * PIXELS_PER_SQUARE}px`
    };

    return createElement("table", tableAttributes, ...rowElements);
}

function drawActors(actors) {
    const actorElements = actors.map(actor => {
        const actorStyles = `
        width: ${actor.size.x * PIXELS_PER_SQUARE}px;
        height: ${actor.size.y * PIXELS_PER_SQUARE}px;
        left: ${actor.position.x * PIXELS_PER_SQUARE}px;
        top: ${actor.position.y * PIXELS_PER_SQUARE}px;
        `;

        const actorAttributes = {
            class: `actor ${actor.type}`,
            style: actorStyles.trim()
        };

        return createElement("div", actorAttributes);
    });

    return createElement("div", {}, ...actorElements);
}

function overlap(actor1, actor2) {
    const xOverlap = actor1.position.x + actor1.size.x > actor2.position.x && actor1.position.x < actor2.position.x + actor2.size.x;
    const yOverlap = actor1.position.y + actor1.size.y > actor2.position.y && actor1.position.y < actor2.position.y + actor2.size.y;
    return xOverlap && yOverlap;
}

function areKeysPressed(keys) {
    let checkedKeys = {};
    function checkKeys(event) {
        if (keys.includes(event.key)) {
            event.preventDefault();
            checkedKeys[event.key] = event.type === "keydown";
        }
    }

    window.addEventListener("keydown", checkKeys);
    window.addEventListener("keyup", checkKeys);
    checkedKeys.deregister = function() {
        window.removeEventListener("keydown", checkKeys);
        window.removeEventListener("keyup", checkKeys);
    }
    return checkedKeys;
}


function runAnimation(animationFunction) {
    let previousTime;
    
    function callFrame(currentTime) {
        if (previousTime !== undefined) {
            const timeInterval = (currentTime - previousTime) / 1000; // Convert time interval from milliseconds to seconds.
            if (animationFunction(timeInterval) === false) return; // Stop the animation. Prevent requestAn... from being called again.
        }
        previousTime = currentTime;
        requestAnimationFrame(callFrame);
    }
    
    requestAnimationFrame(callFrame);
}

function renderLevel(level, DisplayConstructor) {
    const DISPLAY = new DisplayConstructor(document.body, level);
    let state = State.start(level);
    return new Promise(resolve => {
        const ARROW_KEYS = areKeysPressed(["ArrowLeft", "ArrowRight", "ArrowUp"]);
        let endingDelay = 1; // One second delay when you lose or win
        let paused = false;

        function animationFunction(timeInterval) {
            if (paused) return false;
            state = state.update(timeInterval, ARROW_KEYS);
            DISPLAY.displayState(state);
            if (state.status !== "playing") { // Level has ended
                if (endingDelay <= 0) {
                    DISPLAY.clear();
                    ARROW_KEYS.deregister();
                    resolve(state.status);
                    return false;
                } else { endingDelay -= timeInterval; }
            }
            return true;
        }

        function pauseLevel(event) {
            if (event.key === "Escape") {
                paused = !paused;
                if (!paused) {
                    runAnimation(animationFunction);
                }
            }
        }

        window.addEventListener("keydown", pauseLevel);
        runAnimation(animationFunction);
    });
}

async function renderGame(levelsPlans, DisplayConstructor) {
    let lives = 3
    for (let level = 0; level < levelsPlans.length;) {
        console.log(`Lives: ${"❤️".repeat(lives)}`);
        const levelPlan = levelsPlans[level];
        const LEVEL_STATUS = await renderLevel(new Level(levelPlan), DisplayConstructor);
        if (LEVEL_STATUS === "won") level++;
        else lives--;
        if (lives === 0) {
            level = 0;
            lives = 3;
        }
    }
    console.log(" *** CONGRATULATIONS! YOU HAVE WON!!! *** ")
}


// Below are the plans for each of the game levels


const GAME_LEVELS = [`                                                    
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
..................................................................###...........
...................................................##......##....##+##..........
....................................o.o......##..................#+++#..........
.................................................................##+##..........
...................................#####..........................#v#...........
............................................................................##..
..##......................................o.o................................#..
..#.....................o....................................................#..
..#......................................#####.............................o.#..
..#..........####.......o....................................................#..
..#..@.......#..#................................................#####.......#..
..############..###############...####################.....#######...#########..
..............................#...#..................#.....#....................
..............................#+++#..................#+++++#....................
..............................#+++#..................#+++++#....................
..............................#####..................#######....................
................................................................................
................................................................................
`, `                                                                     
................................................................................
................................................................................
....###############################.............................................
...##.............................##########################################....
...#.......................................................................##...
...#....o...................................................................#...
...#................................................=.......................#...
...#.o........################...................o..o...........|........o..#...
...#.........................#..............................................#...
...#....o....................##########.....###################....##########...
...#..................................#+++++#.................#....#............
...###############....oo......=o.o.o..#######.###############.#....#............
.....#...............o..o.............#.......#......#........#....#............
.....#....................#############..######.####.#.########....########.....
.....#.............########..............#...........#.#..................#.....
.....#..........####......####...#####################.#..................#.....
.....#........###............###.......................########....########.....
.....#.......##................#########################......#....#............
.....#.......#................................................#....#............
.....###......................................................#....#............
.......#...............o...........................................#............
.......#...............................................o...........#............
.......#########......###.....############.........................##...........
.............#..................#........#####....#######.o.........########....
.............#++++++++++++++++++#............#....#.....#..................#....
.............#++++++++++++++++++#..........###....###...####.o.............#....
.............####################..........#........#......#.....|.........#....
...........................................#++++++++#......####............#....
...........................................#++++++++#.........#........@...#....
...........................................#++++++++#.........##############....
...........................................##########...........................
................................................................................
`, `
......................................#++#........................#######....................................#+#..
......................................#++#.....................####.....####.................................#+#..
......................................#++##########...........##...........##................................#+#..
......................................##++++++++++##.........##.............##...............................#+#..
.......................................##########++#.........#....................................o...o...o..#+#..
................................................##+#.........#.....o...o....................................##+#..
.................................................#+#.........#................................###############++#..
.................................................#v#.........#.....#...#........................++++++++++++++##..
.............................................................##..|...|...|..##............#####################...
..............................................................##+++++++++++##............v........................
...............................................................####+++++####......................................
...............................................#.....#............#######........###.........###..................
...............................................#.....#...........................#.#.........#.#..................
...............................................#.....#.............................#.........#....................
...............................................#.....#.............................##........#....................
...............................................##....#.............................#.........#....................
...............................................#.....#......o..o.....#...#.........#.........#....................
...............#######........###...###........#.....#...............#...#.........#.........#....................
..............##.....##.........#...#..........#.....#.....######....#...#...#########.......#....................
.............##.......##........#.o.#..........#....##...............#...#...#...............#....................
.....@.......#.........#........#...#..........#.....#...............#...#...#...............#....................
....###......#.........#........#...#..........#.....#...............#...#####...######......#....................
....#.#......#.........#.......##.o.##.........#.....#...............#.....o.....#.#.........#....................
++++#.#++++++#.........#++++++##.....##++++++++##....#++++++++++.....#.....=.....#.#.........#....................
++++#.#++++++#.........#+++++##.......##########.....#+++++++##+.....#############.##..o.o..##....................
++++#.#++++++#.........#+++++#....o.................##++++++##.+....................##.....##.....................
++++#.#++++++#.........#+++++#.....................##++++++##..+.....................#######......................
++++#.#++++++#.........#+++++##.......##############++++++##...+..................................................
++++#.#++++++#.........#++++++#########++++++++++++++++++##....+..................................................
++++#.#++++++#.........#++++++++++++++++++++++++++++++++##.....+..................................................
`, `
..............................................................................................................
..............................................................................................................
..............................................................................................................
..............................................................................................................
..............................................................................................................
........................................o.....................................................................
..............................................................................................................
........................................#.....................................................................
........................................#.....................................................................
........................................#.....................................................................
........................................#.....................................................................
.......................................###....................................................................
.......................................#.#.................+++........+++..###................................
.......................................#.#.................+#+........+#+.....................................
.....................................###.###................#..........#......................................
......................................#...#.................#...oooo...#.......###............................
......................................#...#.................#..........#......#+++#...........................
......................................#...#.................############.......###............................
.....................................##...##......#...#......#................................................
......................................#...#########...########..............#.#...............................
......................................#...#...........#....................#+++#..............................
......................................#...#...........#.....................###...............................
.....................................##...##..........#.......................................................
......................................#...#=.=.=.=....#............###........................................
......................................#...#...........#...........#+++#.......................................
......................................#...#....=.=.=.=#.....o......###.......###..............................
.....................................##...##..........#.....................#+++#.............................
..............................o...o...#...#...........#.....#................##v........###...................
......................................#...#...........#..............#.................#+++#..................
.............................###.###.###.###.....o.o..#++++++++++++++#...................v#...................
.............................#.###.#.#.###.#..........#++++++++++++++#........................................
.............................#.............#...#######################........................................
.............................##...........##.........................................###......................
..###.........................#.....#.....#.........................................#+++#................###..
..#.#.........................#....###....#..........................................###.................#.#..
..#...........................#....###....#######........................#####.............................#..
..#...........................#...........#..............................#...#.............................#..
..#...........................##..........#..............................#.#.#.............................#..
..#.......................................#.......|####|....|####|.....###.###.............................#..
..#................###.............o.o....#..............................#.........###.....................#..
..#...............#####.......##..........#.............................###.......#+++#..........#.........#..
..#...............o###o.......#....###....#.............................#.#........###..........###........#..
..#................###........#############..#.oo.#....#.oo.#....#.oo..##.##....................###........#..
..#......@..........#.........#...........#++#....#++++#....#++++#....##...##....................#.........#..
..#############################...........#############################.....################################..
..............................................................................................................
..............................................................................................................
`, `
..................................................................................................###.#.......
......................................................................................................#.......
..................................................................................................#####.......
..................................................................................................#...........
..................................................................................................#.###.......
..........................o.......................................................................#.#.#.......
.............................................................................................o.o.o###.#.......
...................###................................................................................#.......
.......+..o..+................................................#####.#####.#####.#####.#####.#####.#####.......
.......#.....#................................................#...#.#...#.#...#.#...#.#...#.#...#.#...........
.......#=.o..#............#...................................###.#.###.#.###.#.###.#.###.#.###.#.#####.......
.......#.....#..................................................#.#...#.#...#.#...#.#...#.#...#.#.....#.......
.......+..o..+............o..................................####.#####.#####.#####.#####.#####.#######.......
..............................................................................................................
..........o..............###..............................##..................................................
..............................................................................................................
..............................................................................................................
......................................................##......................................................
...................###.........###............................................................................
..............................................................................................................
..........................o.....................................................#......#......................
..........................................................##.....##...........................................
.............###.........###.........###.................................#..................#.................
..............................................................................................................
.................................................................||...........................................
..###########.................................................................................................
..#.........#.o.#########.o.#########.o.##................................................#...................
..#.........#...#.......#...#.......#...#.................||..................#.....#.........................
..#..@......#####...o...#####...o...#####.....................................................................
..#######.....................................#####.......##.....##.....###...................................
........#=..................=................=#...#.....................###...................................
........#######################################...#+++++++++++++++++++++###+++++++++++++++++++++++++++++++++++
..................................................############################################################
..............................................................................................................
`];
