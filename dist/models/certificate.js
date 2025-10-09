var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import * as Elipses from "@similie/ellipsies";
const { Entity, Column, EllipsiesBaseModelUUID } = Elipses;
let IdentityCertificates = class IdentityCertificates extends EllipsiesBaseModelUUID {
    name;
    identity;
    cert;
    key;
    ca;
};
__decorate([
    Column("varchar", {
        name: "name",
    }),
    __metadata("design:type", String)
], IdentityCertificates.prototype, "name", void 0);
__decorate([
    Column("varchar", {
        name: "identity",
        unique: true,
    }),
    __metadata("design:type", String)
], IdentityCertificates.prototype, "identity", void 0);
__decorate([
    Column("text", {
        name: "cert",
    }),
    __metadata("design:type", String)
], IdentityCertificates.prototype, "cert", void 0);
__decorate([
    Column("text", {
        name: "key",
    }),
    __metadata("design:type", String)
], IdentityCertificates.prototype, "key", void 0);
__decorate([
    Column("text", {
        name: "ca",
        default: false,
    }),
    __metadata("design:type", String)
], IdentityCertificates.prototype, "ca", void 0);
IdentityCertificates = __decorate([
    Entity("certificate", { schema: "public" })
], IdentityCertificates);
export default IdentityCertificates;
