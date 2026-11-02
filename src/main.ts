// Starts the editable Classic Fizz workshop.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import original from '../assets.json';
import { mountGallery } from './gallery.ts';
import { initialiseEditor } from './editor.ts';

import { mountRigPreview } from './rig/preview.ts';

const data = structuredClone(original);
mountGallery(data);
initialiseEditor(data);

mountRigPreview(data);
