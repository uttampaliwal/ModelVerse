import { showToast } from './toast.js';
import { el, $ } from './utils.js';
import { modelMap } from './models.js';

export let pendingAttachment = null;

export function setupAttachmentListeners() {
  $('attachBtn').addEventListener('click', () => $('fileInput').click());

  $('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const attachType = isImage ? 'image' : 'text';
      pendingAttachment = {
        data: ev.target.result,
        name: file.name,
        type: file.type,
        attachType
      };
      $('previewImage').style.display = isImage ? '' : 'none';
      $('attachmentName').style.display = isImage ? 'none' : '';
      if (isImage) {
        $('previewImage').src = ev.target.result;
        $('attachmentName').textContent = '';
      } else {
        $('previewImage').src = '';
        $('attachmentName').textContent = `📄 ${file.name}`;
      }
      $('attachmentPreview').style.display = 'flex';
      $('attachBtn').classList.add('has-attachment');
      $('userInput').focus();
      const m = modelMap[el.modelSelect.value];
      const caps = m && m.capabilities ? m.capabilities : [];
      if (isImage && !caps.includes('vision')) {
        showToast('Warning: current model does not support vision', 'error');
      }
    };
    if (isImage) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
    e.target.value = '';
  });

  $('removeAttachBtn').addEventListener('click', () => {
    pendingAttachment = null;
    $('attachmentPreview').style.display = 'none';
    $('previewImage').src = '';
    $('previewImage').style.display = '';
    $('attachmentName').style.display = 'none';
    $('attachmentName').textContent = '';
    $('attachBtn').classList.remove('has-attachment');
  });
}
