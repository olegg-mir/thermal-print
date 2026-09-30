<script lang="ts">
  export let kind: 'print' | 'templates' | 'settings';
</script>

<svg
  class="nav-icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if kind === 'print'}
    <path
      d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
    />
    <path d="M6 15h12v7H6zM18 12h1" />
  {:else if kind === 'templates'}
    <path d="M5 2h10l4 4v16H5zM15 2v5h4M8 11h8M8 15h8M8 19h6" />
  {:else}
    <path
      d="M10 2h4l.6 2.3a8 8 0 0 1 1.7.7l2.1-1.2 2.8 2.8L20 8.7a8 8 0 0 1 .7 1.7L23 11v4l-2.3.6a8 8 0 0 1-.7 1.7l1.2 2.1-2.8 2.8-2.1-1.2a8 8 0 0 1-1.7.7L14 24h-4l-.6-2.3a8 8 0 0 1-1.7-.7l-2.1 1.2-2.8-2.8L4 17.3a8 8 0 0 1-.7-1.7L1 15v-4l2.3-.6A8 8 0 0 1 4 8.7L2.8 6.6l2.8-2.8L7.7 5a8 8 0 0 1 1.7-.7L10 2z"
      transform="translate(0 -1) scale(1 .92)"
    />
    <circle cx="12" cy="12" r="3.2" />
  {/if}
</svg>
