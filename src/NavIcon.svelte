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
    <circle cx="12" cy="12" r="5.5" />
    <circle cx="12" cy="12" r="2" />
    <path
      d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.2 2.2M17.6 17.6l2.2 2.2M19.8 4.2l-2.2 2.2M6.4 17.6l-2.2 2.2"
    />
  {/if}
</svg>
