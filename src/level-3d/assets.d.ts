// Lets TypeScript accept Vite's `?url` imports, which resolve to the served address of a file.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

declare module '*?url' {
	const url: string;
	export default url;
}
