// Keyboard and mouse input. Held keys are read every frame; one-shot
// presses (enter a car, interact, pause, reload) are queued and taken once,
// so a press between two frames is never lost and never counted twice.
// The mouse steers the camera through pointer lock; clicking the canvas
// locks it, Escape releases it.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseLeft = false;
    this.mouseRight = false;
    this.leftPressed = false;
    this.rightPressed = false;
    this.locked = false;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressed.add(event.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseLeft = false;
      this.mouseRight = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.mouseDX += event.movementX;
      this.mouseDY += event.movementY;
    });
    canvas.addEventListener('mousedown', (event) => {
      if (!this.locked) {
        canvas.requestPointerLock();
        return;
      }
      if (event.button === 0) {
        this.mouseLeft = true;
        this.leftPressed = true;
      } else if (event.button === 2) {
        this.mouseRight = true;
        this.rightPressed = true;
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseLeft = false;
      if (event.button === 2) this.mouseRight = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once, on the frame the key went down.
  hit(code) {
    return this.pressed.has(code);
  }

  // Movement axes: -1..1. Forward is W / ArrowUp, strafe is A / D.
  moveAxis() {
    const f = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0)
      - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    const s = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0)
      - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    return { f, s };
  }

  takeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  // Call at the end of every frame: one-shot presses live for one frame.
  endFrame() {
    this.pressed.clear();
    this.leftPressed = false;
    this.rightPressed = false;
  }
}
