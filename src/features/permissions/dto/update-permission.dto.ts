import { PartialType, OmitType } from '@nestjs/swagger';
import { CreatePermissionDto } from './create-permission.dto';

// Le `code` est immutable après création (référencé par RolePermission et @RequirePermissions)
export class UpdatePermissionDto extends PartialType(OmitType(CreatePermissionDto, ['code'] as const)) {}
