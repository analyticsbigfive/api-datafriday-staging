import {
    Controller,
    Get,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-database.guard';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Controller('organizations')
@UseGuards(JwtDatabaseGuard)
export class OrganizationsController {
    constructor(
        private readonly organizationsService: OrganizationsService,
    ) { }

    @Get(':id')
    async getOrganization(@Param('id') id: string) {
        return this.organizationsService.getOrganization(id);
    }

    @Patch(':id')
    async updateOrganization(
        @Param('id') id: string,
        @Body() dto: UpdateOrganizationDto,
    ) {
        return this.organizationsService.updateOrganization(id, dto);
    }

    @Delete(':id')
    async deleteOrganization(@Param('id') id: string) {
        return this.organizationsService.deleteOrganization(id);
    }
}
