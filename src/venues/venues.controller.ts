import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/auth.decorators';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { VenueDetails, VenuesService } from './venues.service';

@ApiTags('Venues')
@ApiBearerAuth()
@Controller('venues/:venueId')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  // Cualquier rol: el DJ tambien necesita ver en que local opera.
  @Get()
  getVenue(@Param('venueId') venueId: string): Promise<VenueDetails> {
    return this.venuesService.getVenue(venueId);
  }

  @Roles('ADMIN')
  @Patch()
  renameVenue(
    @Param('venueId') venueId: string,
    @Body() dto: UpdateVenueDto,
  ): Promise<VenueDetails> {
    return this.venuesService.renameVenue(venueId, dto.name);
  }
}
