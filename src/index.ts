import { defineComponent, h, onMounted, onUpdated, PropType, ref } from 'vue'
import QR from './qrcodegen'

type Modules = ReturnType<QR.QrCode['getModules']>
export type Level = 'L' | 'M' | 'Q' | 'H'
export type RenderAs = 'canvas' | 'svg'

const defaultErrorCorrectLevel = 'H'

const ErrorCorrectLevelMap : Record<Level, QR.QrCode.Ecc> = {
  L: QR.QrCode.Ecc.LOW,
  M: QR.QrCode.Ecc.MEDIUM,
  Q: QR.QrCode.Ecc.QUARTILE,
  H: QR.QrCode.Ecc.HIGH,
}

// Thanks the `qrcode.react`
const SUPPORTS_PATH2D: boolean = (function () {
  try {
    new Path2D().addPath(new Path2D())
  } catch (e) {
    return false
  }
  return true
})()

function validErrorCorrectLevel(level: string): boolean {
  return level in ErrorCorrectLevelMap
}

function generatePath(modules: Modules, margin: number = 0): string {
  const ops: string[] = []
  modules.forEach(function (row, y) {
    let start: number | null = null
    row.forEach(function (cell, x) {
      if (!cell && start !== null) {
        // M0 0h7v1H0z injects the space with the move and drops the comma,
        // saving a char per operation
        ops.push(
          `M${start + margin} ${y + margin}h${x - start}v1H${start + margin}z`
        )
        start = null
        return
      }

      // end of row, clean up or skip
      if (x === row.length - 1) {
        if (!cell) {
          // We would have closed the op above already so this can only mean
          // 2+ light modules in a row.
          return
        }
        if (start === null) {
          // Just a single dark module.
          ops.push(`M${x + margin},${y + margin} h1v1H${x + margin}z`)
        } else {
          // Otherwise finish the current line.
          ops.push(
            `M${start + margin},${y + margin} h${x + 1 - start}v1H${
              start + margin
            }z`
          )
        }
        return
      }

      if (cell && start === null) {
        start = x
      }
    })
  })
  return ops.join('')
}

const QRCodeProps = {
  value: {
    type: String,
    required: true,
    default: '',
  },
  size: {
    type: Number,
    default: 100,
  },
  level: {
    type: String as PropType<Level>,
    default: defaultErrorCorrectLevel,
    validator: (l: any) => validErrorCorrectLevel(l),
  },
  background: {
    type: String,
    default: '#fff',
  },
  foreground: {
    type: String,
    default: '#000',
  },
  margin: {
    type: Number,
    required: false,
    default: 0,
  },
}

const QRCodeVueProps = {
  ...QRCodeProps,
  renderAs: {
    type: String as PropType<RenderAs>,
    required: false,
    default: 'canvas',
    validator: (as: any) => ['canvas', 'svg'].indexOf(as) > -1,
  },
}

const QRCodeSvg = defineComponent({
  name: 'QRCodeSvg',
  props: QRCodeProps,
  setup(props) {
    const numCells = ref(0)
    const fgPath = ref('')

    const generate = () => {
      const { value, level, margin } = props

      const cells = QR.QrCode.encodeText(value, ErrorCorrectLevelMap[level]).getModules()
      numCells.value = cells.length + margin * 2

      // Drawing strategy: instead of a rect per module, we're going to create a
      // single path for the dark modules and layer that on top of a light rect,
      // for a total of 2 DOM nodes. We pay a bit more in string concat but that's
      // way faster than DOM ops.
      // For level 1, 441 nodes -> 2
      // For level 40, 31329 -> 2
      fgPath.value = generatePath(cells, margin)
    }

    generate()

    onUpdated(generate)

    return () => h(
      'svg',
      {
        width: props.size,
        height: props.size,
        'shape-rendering': `crispEdges`,
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 0 ${numCells.value} ${numCells.value}`,
      },
      [
        h(
          'path',
          {
            fill: props.background,
            d: `M0,0 h${numCells.value}v${numCells.value}H0z`,
          }),
        h('path', { fill: props.foreground, d: fgPath.value }),
      ]
    )
  },
})

const QRCodeCanvas = defineComponent({
  name: 'QRCodeCanvas',
  props: QRCodeProps,
  setup(props) {
    const canvasEl = ref<HTMLCanvasElement | null>(null)

    const generate = () => {
      const { value, level, size, margin, background, foreground } = props

      const canvas = canvasEl.value

      if (!canvas) {
        return;
      }

      const ctx = canvas.getContext('2d')

      if (!ctx) {
        return;
      }

      const cells = QR.QrCode.encodeText(value, ErrorCorrectLevelMap[level]).getModules()
      const numCells = cells.length + margin * 2

      const devicePixelRatio = window.devicePixelRatio || 1

      const scale = (size / numCells) * devicePixelRatio
      canvas.height = canvas.width = size * devicePixelRatio
      ctx.scale(scale, scale)

      ctx.fillStyle = background
      ctx.fillRect(0, 0, numCells, numCells)

      ctx.fillStyle = foreground

      if (SUPPORTS_PATH2D) {
        ctx.fill(new Path2D(generatePath(cells, margin)))
      } else {
        cells.forEach(function (row, rdx) {
          row.forEach(function (cell, cdx) {
            if (cell) {
              ctx.fillRect(cdx + margin, rdx + margin, 1, 1)
            }
          })
        })
      }
    }

    onMounted(generate)
    onUpdated(generate)

    return () => h(
      'canvas',
      {
        ref: canvasEl,
        style: { width: `${props.size}px`, height: `${props.size}px`},
      },
    )
  },
})

const QrcodeVue = defineComponent({
  name: 'Qrcode',
  render() {
    const {
      renderAs,
      value,
      size: _size,
      margin: _margin,
      level: _level,
      background,
      foreground,
    } = this.$props
    const size = _size >>> 0
    const margin = _margin >>> 0
    const level = validErrorCorrectLevel(_level) ? _level : defaultErrorCorrectLevel

    return h(
      renderAs === 'svg' ? QRCodeSvg : QRCodeCanvas,
      { value, size, margin, level, background, foreground },
    )
  },
  props: QRCodeVueProps,
})

export default QrcodeVue
