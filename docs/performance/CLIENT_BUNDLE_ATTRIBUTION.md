# Atribucion de bundle cliente - Etapa 15.3.1

Fecha: 2026-07-19

## 1. Objetivo

Determinar si `/dashboard/pedidos/[id]` y
`/dashboard/solicitudes/[id]` contienen JavaScript cliente exclusivo y material
que justifique una optimizacion posterior. Esta subtarea no modifica la
aplicacion.

## 2. Commit

```text
c720ae5fef5784991252d265180612088ad08b66 fix: reforzar confiabilidad del harness
```

Rama:

```text
perf/measured-optimization
```

## 3. Comandos

```text
npm.cmd run perf:bundle
npm.cmd run perf:navigation
npm.cmd run perf:client-graphs
npm.cmd run perf:client-evidence
```

Los comandos finales terminaron con codigo 0. La validacion completa se registra
en `PERFORMANCE_BASELINE.md`.

## 4. Metodologia

- Se leyo `.next/diagnostics/analyze` directamente.
- La comparacion se hizo por identidad normalizada de fuente, no por resta de
  totales.
- Se compararon fuentes cliente con `bytes` y `compressedBytes`.
- La transferencia real y tiempos cold se calcularon desde muestras individuales
  de `navigation-results.json` con `mode = cold-document-navigation`,
  `phase = measured` y `success = true`.
- Los artefactos locales generados quedan bajo `.next/diagnostics/performance/`.

## 5. Advertencia analyzer vs transferencia

`clientGraphBytes` y los bytes por fuente del analyzer representan superficie
del grafo de build. No equivalen a transferencia de navegador ni aprueban por si
solos una optimizacion.

## 6. Comparacion pedido detalle/listado

| Comparacion | Shared sources | Only target | Exclusive bytes | Exclusive compressed | App exclusive compressed |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/dashboard/pedidos/[id]` vs `/dashboard/pedidos` | 262 | 33 | 55,237 | 22,700 | 20,979 |

Reparto exclusivo del target:

| Categoria | Sources | Bytes | Compressed |
| --- | ---: | ---: | ---: |
| `pedido-domain` | 8 | 28,609 | 10,715 |
| `workspace-shared` | 9 | 20,026 | 8,440 |
| `application-other` | 4 | 4,078 | 1,824 |
| `external-dependency` | 12 | 2,524 | 1,721 |

El dominio de pedido supera por poco 10 KiB comprimidos y queda por encima del
5% del script transferido de la ruta.

## 7. Comparacion solicitud detalle/listado

| Comparacion | Shared sources | Only target | Exclusive bytes | Exclusive compressed | App exclusive compressed |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/dashboard/solicitudes/[id]` vs `/dashboard/solicitudes` | 253 | 35 | 46,853 | 19,776 | 17,758 |

Reparto exclusivo del target:

| Categoria | Sources | Bytes | Compressed |
| --- | ---: | ---: | ---: |
| `workspace-shared` | 9 | 20,043 | 8,453 |
| `solicitud-domain` | 4 | 16,452 | 5,818 |
| `application-other` | 7 | 7,035 | 3,185 |
| `external-dependency` | 14 | 2,877 | 2,018 |
| `shared-ui` | 1 | 446 | 302 |

El total aparente supera 10 KiB por incluir Workspace y otros comunes, pero el
codigo exclusivo del dominio de solicitud queda en 5,818 bytes comprimidos.

## 8. Comparacion entre detalles

| Comparacion | Shared sources | Only pedido detail | Exclusive compressed | App exclusive compressed |
| --- | ---: | ---: | ---: | ---: |
| `/dashboard/pedidos/[id]` vs `/dashboard/solicitudes/[id]` | 282 | 13 | 12,592 | 12,592 |

Costes compartidos entre detalles:

| Categoria | Sources | Target bytes | Target compressed |
| --- | ---: | ---: | ---: |
| `framework-runtime` | 202 | 656,739 | 244,790 |
| `global-style-or-asset` | 4 | 176,714 | 10,679 |
| `shared-ui` | 14 | 23,827 | 12,178 |
| `workspace-shared` | 9 | 20,026 | 8,440 |
| `application-other` | 14 | 18,177 | 8,264 |
| `external-dependency` | 35 | 7,782 | 5,315 |
| `unknown` | 4 | 10,656 | 4,624 |

Workspace es compartido al 100% entre ambos detalles en esta comparacion:
9 fuentes, 20,026 bytes, 8,440 bytes comprimidos.

## 9. Costes compartidos

- Runtime/framework domina el grafo cliente de ambos detalles.
- `src/components/workspace/**` aparece como exclusivo frente a listados, pero
  es compartido entre pedido detalle y solicitud detalle.
- `src/components/ui/**`, estilos globales y assets explican una parte comun
  que no debe atribuirse a un dominio.

## 10. Costes exclusivos

| Ruta | Client graph bytes | Exclusive bytes | Exclusive compressed | App exclusive compressed |
| --- | ---: | ---: | ---: | ---: |
| `/dashboard/pedidos/[id]` | 946,656 | 55,237 | 22,700 | 20,979 |
| `/dashboard/solicitudes/[id]` | 931,197 | 46,853 | 19,776 | 17,758 |

Interpretacion:

- Pedido tiene 10,715 bytes comprimidos de `pedido-domain` exclusivos.
- Solicitud tiene 5,818 bytes comprimidos de `solicitud-domain` exclusivos.
- No se debe tratar `workspace-shared` como candidato de dominio.

## 11. Top fuentes exclusivas

| Fuente | Categoria | Compressed | Decision |
| --- | --- | ---: | --- |
| `SolicitudConvertPedidoForm.tsx` | solicitud-domain | 2,059 | Exclusivo pero demasiado pequeno |
| `PedidoWorkerAssignmentForm.tsx` | pedido-domain | 1,958 | Candidato agrupado |
| `PedidoTaskItem.tsx` | pedido-domain | 1,804 | Candidato agrupado |
| `PedidoTasksSection.tsx` | pedido-domain | 1,709 | Candidato agrupado |
| `WorkspaceTabletToolbar.tsx` | workspace-shared | 1,691 | Compartido; no es exclusivo |
| `WorkspaceController.tsx` | workspace-shared | 1,682 | Compartido; no es exclusivo |
| `PedidoStatusForm.tsx` | pedido-domain | 1,629 | Candidato agrupado |
| `SolicitudClienteForm.tsx` | solicitud-domain | 1,530 | Exclusivo pero demasiado pequeno |
| `CopyableCode.tsx` | application-other | 1,274 | Compartido; no es exclusivo |
| `SolicitudCommentComposer.tsx` | solicitud-domain | 1,246 | Exclusivo pero demasiado pequeno |
| `PedidoCommentComposer.tsx` | pedido-domain | 1,244 | Candidato agrupado |
| `WorkspaceActionRail.tsx` | workspace-shared | 1,208 | Compartido; no es exclusivo |
| `PedidoFileUploadForm.tsx` | application-other | 1,202 | Candidato agrupado |
| `MobileWorkspaceBar.tsx` | workspace-shared | 1,107 | Compartido; no es exclusivo |
| `ApplyTaskTemplateForm.tsx` | pedido-domain | 1,042 | Candidato agrupado |
| `WorkspaceContextDialog.tsx` | workspace-shared | 1,023 | Compartido; no es exclusivo |
| `SolicitudStatusForm.tsx` | solicitud-domain | 983 | Exclusivo pero demasiado pequeno |
| `PedidoPaymentForm.tsx` | pedido-domain | 780 | Candidato agrupado |
| `src/lib/pedidos/status.ts` | application-other | 754 | Candidato agrupado |
| `WorkspaceActionTrigger.tsx` | workspace-shared | 667 | Compartido; no es exclusivo |

Ninguna fuente individual alcanza 10 KiB comprimidos. El candidato material es
la agrupacion de paneles cliente de pedido, no un archivo aislado.

## 12. Import chains

| Fuente | Import chain | Client root | Interaccion exige cliente | Superficie inicial | Panel contextual | Compartido | Separacion posible |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `PedidoTasksSection` | page pedido -> `tasksPanelContent` -> `InternalPedidoDetail` -> Workspace panel `tareas` | Si | Si, forms y `useActionState` | No | Si | No | Posible, requiere conservar Server Actions |
| `PedidoTaskItem` | `PedidoTasksSection` -> `PedidoTaskItem` | Si | Si, acciones de tarea | No | Si | No | Posible dentro del mismo grupo |
| `PedidoWorkerAssignmentForm` | page pedido -> `personnelPanelContent` -> panel `personal` | Si | Si, asignar/remover personal | No | Si | No | Posible, requiere conservar acciones enlazadas |
| `PedidoStatusForm` | `InternalPedidoDetail` -> panel `estado` | Si | Si, cambio de estado | No | Si | No | Posible, pero panel primario |
| `PedidoFileUploadForm` | page pedido -> `fileUploadPanelContent` -> panel `archivos` | Si | Si, upload y pending | No | Si | No | Posible con cuidado por input file |
| `PedidoCommentComposer` | page pedido -> `commentComposerPanelContent` -> panel `comentarios` | Si | Si, textarea auto resize y action | No | Si | No | Posible |
| `ApplyTaskTemplateForm` | `PedidoTasksSection` -> `ApplyTaskTemplateForm` | Si | Si | No | Si | No | Posible dentro de tareas |
| `PedidoPaymentForm` | `PedidoPaymentSection` -> `PedidoPaymentForm` | Si | Si | No | Si | No | Posible dentro de pagos |
| `SolicitudConvertPedidoForm` | page solicitud -> `conversionPanelContent` -> panel `conversion` | Si | Si | No | Si | No | No optimizar por tamano |
| `SolicitudClienteForm` | page solicitud -> `clientePanelContent` -> panel `cliente` | Si | Si | No | Si | No | No optimizar por tamano |
| `SolicitudCommentComposer` | `InternalSolicitudDetail` -> panel `comentarios` | Si | Si | No | Si | No | No optimizar por tamano |
| `SolicitudStatusForm` | `InternalSolicitudDetail` -> panel `estado` | Si | Si | No | Si | No | No optimizar por tamano |
| `WorkspaceController` | `InternalPedidoDetail` y `InternalSolicitudDetail` -> root workspace | Si | Si, dialog/focus/estado | Si | N/A | Si | No dividir en 15.3 |
| `WorkspaceContextDialog` | `WorkspaceController` -> dialog | Si | Si, foco/cancel/close | Si | N/A | Si | No dividir en 15.3 |
| `WorkspaceTabletToolbar` | `WorkspaceShell` -> toolbar | Si | Si, acciones visibles | Si | N/A | Si | No dividir en 15.3 |
| `WorkspaceActionRail` | `WorkspaceShell` -> rail | Si | Si, acciones desktop | Si | N/A | Si | No dividir en 15.3 |
| `MobileWorkspaceBar` | `WorkspaceShell` -> mobile bar | Si | Si, acciones mobile | Si | N/A | Si | No dividir en 15.3 |
| `WorkspaceActionTrigger` | rail/bar/toolbar -> trigger | Si | Si | Si | N/A | Si | No dividir en 15.3 |
| `CopyableCode` | headers/information panels de detalles | Si | Si, copy UI | Parcial | Si | Si | No optimizar |
| `src/lib/pedidos/status.ts` | formularios de pedido -> reglas de estado | No | Apoya cliente | No | Si | No | Solo como parte del grupo |

`WorkspaceController` ya preserva foco de disparador, dialog nativo, bloqueo de
scroll, cancel, retorno desde "mas acciones" y contenido `ReactNode`. Cualquier
separacion debe respetar esos contratos.

## 13. Transferencia real

| Ruta | Median script transfer | Median total transfer |
| --- | ---: | ---: |
| `/dashboard` | 164,090 | 250,931 |
| `/dashboard/pedidos` | 168,425 | 302,080 |
| `/dashboard/pedidos/[id]` | 177,068 | 238,236 |
| `/dashboard/solicitudes` | 160,309 | 286,661 |
| `/dashboard/solicitudes/[id]` | 172,566 | 236,013 |

Ratio de app exclusive compressed contra script transfer:

- Pedido detalle: 20,979 / 177,068 = 11.85%.
- Solicitud detalle: 17,758 / 172,566 = 10.29%, pero el dominio solicitud
  exclusivo es solo 5,818 bytes comprimidos.

## 14. Tiempos cold

| Ruta | Median cold wall ms | Spread | Stability |
| --- | ---: | ---: | --- |
| `/dashboard` | 429 | 0.023 | stable |
| `/dashboard/pedidos` | 460 | 0.043 | stable |
| `/dashboard/pedidos/[id]` | 126 | 0.048 | stable |
| `/dashboard/solicitudes` | 449 | 0.036 | stable |
| `/dashboard/solicitudes/[id]` | 124 | 0.097 | stable |

No hay problema observable de tiempo cold en los detalles. La motivacion de
15.3.2, si se ejecuta, seria reducir transferencia/script inicial medible sin
degradar arquitectura.

## 15. Hipotesis evaluadas

### H1 - Workspace compartido

Confirmada. `src/components/workspace/**` suma 8,440 bytes comprimidos y esta
compartido por ambos detalles. No se propone dividir `WorkspaceController`.

### H2 - Paneles de pedido

Existe candidato agrupado:

| Fuente | Compressed |
| --- | ---: |
| `PedidoTasksSection` | 1,709 |
| `PedidoTaskItem` | 1,804 |
| `PedidoWorkerAssignmentForm` | 1,958 |
| `PedidoStatusForm` | 1,629 |
| `PedidoFileUploadForm` | 1,202 |
| `PedidoCommentComposer` | 1,244 |
| `PedidoPaymentForm` | 780 |
| `ApplyTaskTemplateForm` | 1,042 |

El grupo relevante ronda 11 KiB comprimidos. `PedidoPaymentSection` no aparece
como fuente cliente exclusiva; el coste cliente de pago se concentra en
`PedidoPaymentForm`.

### H3 - Paneles de solicitud

Los formularios de solicitud son exclusivos, pero pequenos:

| Fuente | Compressed |
| --- | ---: |
| `SolicitudConvertPedidoForm` | 2,059 |
| `SolicitudClienteForm` | 1,530 |
| `SolicitudCommentComposer` | 1,246 |
| `SolicitudStatusForm` | 983 |

Total de dominio solicitud: 5,818 bytes comprimidos. No alcanza el umbral.

### H4 - Lucide

`lucide-react` exclusivo frente a listado:

| Comparacion | Sources | Compressed |
| --- | ---: | ---: |
| Pedido detalle vs listado | 12 | 1,721 |
| Solicitud detalle vs listado | 14 | 2,018 |
| Pedido detalle vs dashboard | 2 | 297 |
| Solicitud detalle vs dashboard | 2 | 297 |

No es material. No se propone `optimizePackageImports`.

### H5 - Codigo oculto en paneles

Confirmado parcialmente. Los paneles contextuales introducen JavaScript cliente
en la carga fria aunque no sean la superficie principal visible. En pedido, el
grupo es material; en solicitud, no.

## 16. Decisiones

- P15-C01 se confirma como candidato material para 15.3.2.
- El candidato exacto es separar de forma medida el grupo de paneles cliente de
  pedido, manteniendo contratos de Server Actions, foco, dialog, pending,
  errores parciales, responsive y accesibilidad.
- P15-C02 se descarta para optimizacion de 15.3: el dominio exclusivo es
  pequeno y la ruta cold es estable.
- `WorkspaceController`, Workspace shell, Lucide y componentes UI compartidos no
  deben optimizarse en 15.3.

## 17. Riesgos

- Los paneles se pasan como `ReactNode` desde Server Components hacia un Client
  Component raiz.
- Varios paneles reciben Server Actions enlazadas como props.
- `WorkspaceController` concentra foco, dialog, cancel, retorno de foco, barras
  responsive y "mas acciones".
- Separar paneles sin preservar estados `pending`, errores, cierre por escape y
  retorno de foco puede degradar UX.
- La mejora esperada debe demostrarse con before/after; el analyzer solo no
  basta.

## 18. Conclusion

Existe candidato material para 15.3.2, limitado a P15-C01:
`/dashboard/pedidos/[id]`. La siguiente subtarea recomendada es:

```text
15.3.2 - Separacion medida de paneles cliente de pedido
```

No se implementa ninguna optimizacion en 15.3.1.

## 19. Actualizacion 15.3.2

Fecha: 2026-07-20

Resultado final:

```text
Optimizacion medida y revertida
```

Se ejecuto el experimento reversible de separacion de paneles cliente de pedido
con `next/dynamic` en wrappers de dominio. La aplicacion quedo revertida porque
la mejora objetivo no aparecio en transferencia real:

| Metrica `/dashboard/pedidos/[id]` | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Median script transfer bytes | 178,463 | 178,463 | 0 |
| Median cold wall ms | 121 | 119 | -2 |
| Client graph bytes | 946,656 | 953,499 | +6,843 |
| App exclusive compressed bytes | 20,979 | 22,579 | +1,600 |

Los controles no degradaron en transferencia de script, pero P15-C01 no alcanzo
el umbral minimo de reduccion (`>= 10 KiB` o `>= 5%`). Los paneles tampoco
aportaron evidencia favorable: las aperturas medidas siguieron descargando los
mismos bytes de script por panel y varios paneles quedaron por encima de 250 ms
o con estabilidad `unreliable` por ruido local.

Decision:

- P15-C01 queda descartado para 15.3.
- No se conserva ningun wrapper diferido ni cambio de aplicacion.
- Se conserva el harness focal de paneles y el comparador before/after porque
  son pequenos y reutilizables.
- 15.3 queda cerrada sin optimizacion de aplicacion.
- Siguiente investigacion recomendada: `15.5.1 - SQL focal de listados /
  dashboard`, empezando por los deltas observados en `pg_stat_statements`.
