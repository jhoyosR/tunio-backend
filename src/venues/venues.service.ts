import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Venue } from './entities/venue.entity';

export interface VenueDetails {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

@Injectable()
export class VenuesService {
  constructor(
    @InjectRepository(Venue)
    private readonly venueRepository: Repository<Venue>,
  ) {}

  // El guard de establecimiento ya comprobo que el local existe y que quien
  // llama pertenece a el; por eso no se distingue el caso "no encontrado".
  async getVenue(venueId: string): Promise<VenueDetails> {
    const venue = await this.venueRepository.findOneByOrFail({ id: venueId });
    return this.toDetails(venue);
  }

  // El slug no cambia con el nombre: es un identificador estable.
  async renameVenue(venueId: string, name: string): Promise<VenueDetails> {
    const venue = await this.venueRepository.findOneByOrFail({ id: venueId });
    venue.name = name;
    return this.toDetails(await this.venueRepository.save(venue));
  }

  private toDetails(venue: Venue): VenueDetails {
    return {
      id: venue.id,
      name: venue.name,
      slug: venue.slug,
      isActive: venue.isActive,
    };
  }
}
