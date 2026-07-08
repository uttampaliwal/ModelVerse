import { showToast } from './toast.js';
import { el, $ } from './utils.js';
import { modelMap } from './models.js';

export interface PendingAttachment {
  data: string;
  name: string;
  type: string;
  attachType: 'image' | 'text';
}

export let pendingAttachment: PendingAttachment | null = null;

export function clearPendingAttachment(): void {
  pendingAttachment = null;
}

export function setupAttachmentListeners(): void {
  $('attachBtn').addEventListener('click', () => $<HTMLInputElement>('fileInput').click());

  $<HTMLInputElement>('fileInput').addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = (ev.target as FileReader).result as string;
      const attachType: 'image' | 'text' = isImage ? 'image' : 'text';
      pendingAttachment = {
        data: result,
        name: file.name,
        type: file.type,
        attachType,
      };
      $<HTMLImageElement>('previewImage').style.display = isImage ? '' : 'none';
      $('attachmentName').style.display = isImage ? 'none' : '';
      if (isImage) {
        $<HTMLImageElement>('previewImage').src = result;
        $('attachmentName').textContent = '';
      } else {
        $<HTMLImageElement>('previewImage').src = '';
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
    (e.target as HTMLInputElement).value = '';
  });

  $('removeAttachBtn').addEventListener('click', () => {
    pendingAttachment = null;
    $('attachmentPreview').style.display = 'none';
    $<HTMLImageElement>('previewImage').src = '';
    $<HTMLImageElement>('previewImage').style.display = '';
    $('attachmentName').style.display = 'none';
    $('attachmentName').textContent = '';
    $('attachBtn').classList.remove('has-attachment');
  });
}
