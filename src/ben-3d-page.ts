// Starts the separate rigged 3D Ben page.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import original from '../assets.json';
import { mountBen3D } from './model-3d/preview.ts';

mountBen3D(structuredClone(original));
