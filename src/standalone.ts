// Starts the bundled read-only gallery with embedded sprite data.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { mountTurntable } from './turntable-preview.ts';
import { mountGallery } from './gallery.ts';
import type { WorkshopData } from './types.ts';

declare const DATA: WorkshopData;
mountGallery(DATA);
mountTurntable(DATA);
