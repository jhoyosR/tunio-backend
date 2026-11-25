import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

// Aviso de "algo cambio en la cola de este local". Lo llaman los servicios
// que modifican la cola, la cancion en curso o el estado de la sesion, y lo
// escucha el gateway. Vive en un modulo aparte para que esos servicios no
// dependan del gateway, que a su vez depende de ellos.
@Injectable()
export class LiveUpdatesService {
  private readonly changes = new Subject<string>();

  readonly venueChanged$: Observable<string> = this.changes.asObservable();

  // Llamar siempre DESPUES de confirmar la transaccion: el gateway relee la
  // base, y antes del commit veria el estado anterior.
  venueChanged(venueId: string): void {
    this.changes.next(venueId);
  }
}
