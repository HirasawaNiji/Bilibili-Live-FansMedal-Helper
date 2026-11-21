<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import hotkeys from 'hotkeys-js'
import _ from 'lodash'
import ControlPanel from './components/ControlPanel.vue'
import { dce, isSelfTopFrame, topFrameDocumentElement, waitForElement } from './library/dom'
import Logger from './library/logger'
import { useUIStore } from './stores'

const uiStore = useUIStore()
const logger = new Logger('App.vue')
const newHeaderAnchor = '#head-info-vm > .header-left'
const legacyHeaderRow = '.header-info-ctnr .normal-row-ctnr'
let button: HTMLButtonElement | null = null
let buttonAnchor: HTMLElement | null = null
let buttonAnchorObserver: ResizeObserver | undefined

/** 根据主播信息区域的位置定位入口按钮；面板本身不再依赖播放器的位置和大小。 */
function updateButtonPosition() {
  if (!button) return
  button.style.left = `${buttonAnchor ? buttonAnchor.offsetLeft + buttonAnchor.offsetWidth + 15 : 15}px`
}

const throttleButtonOnClick = _.throttle(() => uiStore.changeShowPanel(), 300)
watch(
  () => uiStore.isShowPanelButtonText,
  (text) => {
    if (button) button.innerText = text
  },
)

// 入口按钮与快捷键独立注册，标题栏暂未就绪时快捷键也能打开面板。
hotkeys('alt+b', throttleButtonOnClick)
const topFrameRoot = !isSelfTopFrame() ? topFrameDocumentElement() : undefined
if (topFrameRoot) {
  hotkeys('alt+b', { element: topFrameRoot }, throttleButtonOnClick)
}

// 新版标题栏的占位节点会被替换，从稳定的祖先节点等待主播信息。
waitForElement(document.body, `${newHeaderAnchor}, ${legacyHeaderRow}`, 10e3)
  .then((header) => {
    const anchor = header.matches(newHeaderAnchor) ? header : header.firstElementChild
    buttonAnchor = anchor instanceof HTMLElement ? anchor : null
    button = dce('button')
    button.type = 'button'
    button.setAttribute('class', 'blth-btn')
    button.onclick = throttleButtonOnClick
    button.innerText = uiStore.isShowPanelButtonText
    if (buttonAnchor) buttonAnchor.after(button)
    else header.appendChild(button)
    updateButtonPosition()
    if (buttonAnchor) {
      buttonAnchorObserver = new ResizeObserver(updateButtonPosition)
      buttonAnchorObserver.observe(buttonAnchor)
    }
  })
  .catch((error: Error) => logger.error(error))

window.addEventListener('resize', updateButtonPosition)
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateButtonPosition)
  buttonAnchorObserver?.disconnect()
  hotkeys.unbind('alt+b', throttleButtonOnClick)
  throttleButtonOnClick.cancel()
  button?.remove()
})
</script>

<template>
  <ControlPanel />
</template>
